/* ==========================================================================
   TUMAINI - SUPABASE PRODUCTION BACKEND INTEGRATION
   - Realtime PostgreSQL subscriptions (intakes, messages, confessions)
   - Server-side hashed authentication for Counselors & Supervisor
   - Row-Level Security (RLS) enforcement
   - Zero hardcoded passwords; secure remote persistence across all devices
   ========================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Default / Configured Supabase Credentials
const DEFAULT_SUPABASE_URL = 'https://ddgkgrtiplvhlrwzoiia.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZ2tncnRpcGx2aGxyd3pvaWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjMxNzUsImV4cCI6MjEwNjQ5OTE3NX0.gT4QkgQJKN7KG1NQewBNAkkgE_gaVmE6e97F4o8AwVk';

// Check for runtime configured or stored credentials
function getSupabaseConfig() {
  let url = DEFAULT_SUPABASE_URL;
  let anonKey = DEFAULT_SUPABASE_ANON_KEY;

  try {
    const customUrl = localStorage.getItem('tumaini_supabase_url');
    const customKey = localStorage.getItem('tumaini_supabase_anon_key');
    if (customUrl && customKey) {
      url = customUrl;
      anonKey = customKey;
    }
  } catch (e) {}

  const isConfigured = url && !url.includes('YOUR_PROJECT_ID') && anonKey && !anonKey.includes('YOUR_SUPABASE_ANON_KEY');

  return { url, anonKey, isConfigured };
}

class TumainiSupabaseService {
  constructor() {
    const { url, anonKey, isConfigured } = getSupabaseConfig();
    this.url = url;
    this.anonKey = anonKey;
    this.isConfigured = isConfigured;
    this.client = null;
    this.channels = {};

    if (this.isConfigured) {
      try {
        this.client = createClient(this.url, this.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          },
          realtime: {
            params: {
              eventsPerSecond: 10
            }
          }
        });
        console.log('[Tumaini] Supabase Client Initialized:', this.url);

        if (typeof window !== 'undefined') {
          window.addEventListener('pageshow', (event) => {
            if (event.persisted && this.client && this.client.realtime) {
              try {
                this.client.realtime.disconnect();
                setTimeout(() => {
                  if (this.client && this.client.realtime) this.client.realtime.connect();
                }, 300);
              } catch (e) {}
            }
          });

          window.addEventListener('pagehide', (event) => {
            if (event.persisted && this.client && this.client.realtime) {
              try {
                this.client.realtime.disconnect();
              } catch (e) {}
            }
          });

          window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.client && this.client.realtime) {
              try {
                if (!this.client.realtime.isConnected()) {
                  this.client.realtime.connect();
                }
              } catch (e) {}
            }
          });
        }
      } catch (err) {
        console.error('[Tumaini] Error initializing Supabase client', err);
      }
    } else {
      console.warn('[Tumaini] Supabase credentials not set. Running in local fallback mode.');
    }
  }

  // Update credentials at runtime (e.g. from Supervisor Desk)
  configureCredentials(url, anonKey) {
    if (!url || !anonKey) return false;
    try {
      localStorage.setItem('tumaini_supabase_url', url.trim());
      localStorage.setItem('tumaini_supabase_anon_key', anonKey.trim());
      this.url = url.trim();
      this.anonKey = anonKey.trim();
      this.isConfigured = true;
      this.client = createClient(this.url, this.anonKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- 1. Counselor & Staff Authentication ---
  async verifyLogin(staffId, password) {
    if (!this.isConfigured || !this.client) {
      return { success: false, fallback: true, error: 'Supabase backend not connected.' };
    }

    try {
      const { data, error } = await this.client.rpc('verify_counselor_login', {
        p_staff_id: staffId.trim(),
        p_password: password.trim()
      });

      if (error) {
        console.error('[Tumaini Auth] Supabase RPC error:', error);
        return { success: false, error: error.message };
      }

      if (data && data.length > 0 && data[0].success) {
        const row = data[0];
        let isOnDuty = !!row.is_on_duty;
        let shiftStartedAt = row.shift_started_at ? new Date(row.shift_started_at).getTime() : null;

        if (!isOnDuty) {
          const remoteDuty = await this.getDutyStatus(row.staff_id);
          if (remoteDuty && remoteDuty.isOnDuty) {
            isOnDuty = true;
            shiftStartedAt = remoteDuty.shiftStartedAt;
          }
        }

        return {
          success: true,
          staff: {
            staffId: row.staff_id,
            name: row.name,
            role: row.role,
            isSupervisor: row.is_supervisor,
            isOnDuty,
            shiftStartedAt
          }
        };
      }

      return { success: false, error: 'Invalid Operator ID or Password.' };
    } catch (err) {
      console.error('[Tumaini Auth] Network exception:', err);
      return { success: false, error: 'Network error connecting to auth server.' };
    }
  }

  async createCounselor({ supervisorId, supervisorPassword, name, role, password }) {
    if (!this.isConfigured || !this.client) {
      return { success: false, fallback: true, error: 'Supabase backend not connected.' };
    }

    try {
      const payload = {
        p_supervisor_id: supervisorId,
        p_name: name,
        p_role: role || 'Crisis Counselor',
        p_password: password
      };
      if (supervisorPassword) {
        payload.p_supervisor_password = supervisorPassword;
      }

      const { data, error } = await this.client.rpc('create_counselor_account', payload);

      if (error) return { success: false, error: error.message };
      if (data && data.length > 0 && data[0].success) {
        return {
          success: true,
          staffId: data[0].staff_id,
          name: data[0].name,
          role: data[0].role,
          password
        };
      }
      return { success: false, error: data?.[0]?.error_message || 'Failed to create counselor.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getCounselors(supervisorId) {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('counselors')
        .select('staff_id, name, role, is_supervisor, is_active, created_at, last_login_at')
        .neq('staff_id', 'SUPERVISOR')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching counselors:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  }

  async revokeCounselor(supervisorId, targetStaffId, supervisorPassword) {
    if (!this.isConfigured || !this.client) return false;
    try {
      const payload = {
        p_supervisor_id: supervisorId,
        p_target_id: targetStaffId
      };
      if (supervisorPassword) {
        payload.p_supervisor_password = supervisorPassword;
      }
      const { data, error } = await this.client.rpc('revoke_counselor_account', payload);
      return !error && !!data;
    } catch (e) {
      return false;
    }
  }

  // --- Shift Duty Synchronization ---
  async setDutyStatus(staffId, isOnDuty, shiftStartedAt) {
    if (!this.isConfigured || !this.client || !staffId) return false;
    try {
      const shiftIso = shiftStartedAt ? new Date(shiftStartedAt).toISOString() : null;
      const { data, error } = await this.client.rpc('set_counselor_duty_status', {
        p_staff_id: staffId.trim(),
        p_is_on_duty: !!isOnDuty,
        p_shift_started_at: shiftIso
      });
      if (error) {
        // Direct table update fallback
        const { error: updErr } = await this.client
          .from('counselors')
          .update({ is_on_duty: !!isOnDuty, shift_started_at: shiftIso })
          .ilike('staff_id', staffId.trim());
        return !updErr;
      }
      return !error && !!data;
    } catch (e) {
      return false;
    }
  }

  async getDutyStatus(staffId) {
    if (!this.isConfigured || !this.client || !staffId) return null;
    try {
      const { data, error } = await this.client.rpc('get_counselor_duty_status', {
        p_staff_id: staffId.trim()
      });
      if (!error && data && data.length > 0) {
        return {
          isOnDuty: !!data[0].is_on_duty,
          shiftStartedAt: data[0].shift_started_at ? new Date(data[0].shift_started_at).getTime() : null
        };
      }
      // Direct table query fallback
      const { data: rows, error: qErr } = await this.client
        .from('counselors')
        .select('is_on_duty, shift_started_at')
        .ilike('staff_id', staffId.trim())
        .limit(1);
      if (!qErr && rows && rows.length > 0) {
        return {
          isOnDuty: !!rows[0].is_on_duty,
          shiftStartedAt: rows[0].shift_started_at ? new Date(rows[0].shift_started_at).getTime() : null
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // --- 2. Intakes & Crisis Triage ---
  async fetchActiveIntakes() {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('intakes')
        .select('*')
        .neq('status', 'resolved')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching intakes:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  }

  async createIntake(intakeData) {
    if (!this.isConfigured || !this.client) return null;
    try {
      const { data, error } = await this.client
        .from('intakes')
        .insert([{
          id: intakeData.id,
          alias: intakeData.alias,
          tier: intakeData.tier,
          category: intakeData.category,
          summary: intakeData.summary || '',
          status: 'waiting',
          seeker_token: intakeData.seekerToken || '',
          created_at: new Date(intakeData.createdAt || Date.now()).toISOString(),
          updated_at: new Date(intakeData.updatedAt || Date.now()).toISOString()
        }])
        .select();

      if (error) console.error('Error creating intake:', error);
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  async updateIntakeStatus(intakeId, status, staffInfo = null) {
    if (!this.isConfigured || !this.client) return false;
    try {
      const updatePayload = {
        status,
        updated_at: new Date().toISOString()
      };
      if (staffInfo) {
        updatePayload.claimed_by_id = staffInfo.staffId;
        updatePayload.claimed_by_name = staffInfo.name;
        updatePayload.claimed_by_role = staffInfo.role;
      }
      const { error } = await this.client
        .from('intakes')
        .update(updatePayload)
        .eq('id', intakeId);

      return !error;
    } catch (e) {
      return false;
    }
  }

  // --- 3. 1-on-1 Messages ---
  async fetchMessages(intakeId) {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('intake_messages')
        .select('*')
        .eq('intake_id', intakeId)
        .order('created_at', { ascending: true });

      if (error) return [];
      return (data || []).map(m => ({
        id: m.id,
        intakeId: m.intake_id,
        sender: m.sender,
        authorName: m.author_name,
        text: m.text,
        timestamp: new Date(m.created_at).getTime()
      }));
    } catch (e) {
      return [];
    }
  }

  async sendMessage(intakeId, { id, sender, authorName, text }) {
    if (!this.isConfigured || !this.client) return null;
    try {
      const payload = {
        intake_id: intakeId,
        sender,
        author_name: authorName,
        text
      };
      if (id) payload.id = id;

      const { data, error } = await this.client
        .from('intake_messages')
        .insert([payload])
        .select();

      if (error) console.error('Error sending message:', error);
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  // --- 4. Confessions ---
  async fetchApprovedConfessions() {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('confessions')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) return [];
      return (data || []).map(c => ({
        id: c.id,
        username: c.username,
        category: c.category,
        text: c.text,
        status: c.status,
        empathyCount: c.empathy_count,
        createdAt: new Date(c.created_at).getTime()
      }));
    } catch (e) {
      return [];
    }
  }

  async fetchPendingConfessions() {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('confessions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) return [];
      return (data || []).map(c => ({
        id: c.id,
        username: c.username,
        category: c.category,
        text: c.text,
        status: c.status,
        empathyCount: c.empathy_count,
        createdAt: new Date(c.created_at).getTime()
      }));
    } catch (e) {
      return [];
    }
  }

  async createConfession({ id, username, category, text }) {
    if (!this.isConfigured || !this.client) return null;
    try {
      const { data, error } = await this.client
        .from('confessions')
        .insert([{
          id: id || `conf-${Date.now()}`,
          username,
          category,
          text,
          status: 'pending'
        }])
        .select();

      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  async updateConfessionStatus(confessionId, status) {
    if (!this.isConfigured || !this.client) return false;
    try {
      const { error } = await this.client
        .from('confessions')
        .update({ status })
        .eq('id', confessionId);

      return !error;
    } catch (e) {
      return false;
    }
  }

  async incrementEmpathy(confessionId) {
    if (!this.isConfigured || !this.client) return;
    try {
      await this.client.rpc('increment_empathy', { confession_id: confessionId });
    } catch (e) {}
  }

  // --- 5. Supabase Realtime Subscriptions ---
  subscribeToIntakes(onInsert, onUpdate) {
    if (!this.isConfigured || !this.client) return () => {};

    const channel = this.client
      .channel('public:intakes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intakes' },
        payload => onInsert && onInsert(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'intakes' },
        payload => onUpdate && onUpdate(payload.new)
      )
      .subscribe();

    return () => {
      this.client.removeChannel(channel);
    };
  }

  subscribeToMessages(intakeId, onMessage) {
    if (!this.isConfigured || !this.client) return () => {};

    const channel = this.client
      .channel(`public:intake_messages:${intakeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intake_messages',
          filter: `intake_id=eq.${intakeId}`
        },
        payload => {
          if (onMessage && payload.new) {
            onMessage({
              id: payload.new.id,
              intakeId: payload.new.intake_id,
              sender: payload.new.sender,
              authorName: payload.new.author_name,
              text: payload.new.text,
              timestamp: new Date(payload.new.created_at).getTime()
            });
          }
        }
      )
      .subscribe();

    return () => {
      this.client.removeChannel(channel);
    };
  }

  subscribeToAllMessages(onMessage) {
    if (!this.isConfigured || !this.client) return () => {};

    const channel = this.client
      .channel('public:all_intake_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intake_messages'
        },
        payload => {
          if (onMessage && payload.new) {
            onMessage({
              id: payload.new.id,
              intakeId: payload.new.intake_id,
              sender: payload.new.sender,
              authorName: payload.new.author_name,
              text: payload.new.text,
              timestamp: new Date(payload.new.created_at).getTime()
            });
          }
        }
      )
      .subscribe();

    return () => {
      this.client.removeChannel(channel);
    };
  }
}

export const supabase = new TumainiSupabaseService();
