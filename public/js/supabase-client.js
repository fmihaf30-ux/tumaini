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
    this.dutyRpcDisabled = false;
    this.dutyColumnsDisabled = false;
    this.shiftsTableDisabled = false;
    this.profileRpcDisabled = false;

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
          let isSuspended = false;

          const handleSuspend = () => {
            if (isSuspended) return;
            isSuspended = true;
            try {
              if (this.client && this.client.realtime) {
                this.client.realtime.disconnect();
              }
            } catch (e) {}
          };

          const handleResume = () => {
            if (!isSuspended) return;
            isSuspended = false;
            try {
              if (this.client && this.client.realtime) {
                if (!this.client.realtime.isConnected()) {
                  this.client.realtime.connect();
                }
              }
            } catch (e) {}
          };

          // Clean teardown before bfcache transition
          window.addEventListener('pagehide', handleSuspend);
          document.addEventListener('freeze', handleSuspend);

          // Clean reconnect on return
          window.addEventListener('pageshow', (event) => {
            if (event.persisted || isSuspended) {
              handleResume();
            }
          });
          document.addEventListener('resume', handleResume);

          window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              handleResume();
            } else if (document.visibilityState === 'hidden') {
              // Gracefully handle app backgrounding
            }
          });

          // Intercept clicks on external protocol links (tel:0800..., mailto:, sms:)
          // so WebSocket disconnects cleanly before OS opens external dialer
          document.addEventListener('click', (e) => {
            const externalLink = e.target?.closest?.('a[href^="tel:"], a[href^="mailto:"], a[href^="sms:"]');
            if (externalLink) {
              handleSuspend();
              setTimeout(() => {
                if (document.visibilityState === 'visible') {
                  handleResume();
                }
              }, 1500);
            }
          }, { capture: true, passive: true });
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
        p_password: password,
        p_supervisor_password: supervisorPassword || ''
      };

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
      // 1. Try secure RPC first
      if (!this.counselorsRosterRpcDisabled) {
        try {
          const { data: rpcData, error: rpcErr } = await this.client.rpc('get_active_counselors_roster');
          if (!rpcErr && rpcData && Array.isArray(rpcData)) {
            return rpcData;
          }
          if (rpcErr && (rpcErr.code === 'PGRST202' || rpcErr.code === '42883' || rpcErr.status === 404)) {
            this.counselorsRosterRpcDisabled = true;
          }
        } catch (rpcEx) {
          this.counselorsRosterRpcDisabled = true;
        }
      }

      // 2. Direct table select fallback
      const { data, error } = await this.client
        .from('counselors')
        .select('staff_id, name, role, is_supervisor, is_active, created_at, last_login_at')
        .neq('staff_id', 'SUPERVISOR')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
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
        p_target_id: targetStaffId,
        p_supervisor_password: supervisorPassword || ''
      };
      const { data, error } = await this.client.rpc('revoke_counselor_account', payload);
      return !error && !!data;
    } catch (e) {
      return false;
    }
  }

  async broadcastStaffRevocation(staffId) {
    if (!this.isConfigured || !this.client || !staffId) return;
    try {
      if (!this.channels['staff_broadcast']) {
        this.channels['staff_broadcast'] = this.client.channel('tumaini_staff_channel');
        this.channels['staff_broadcast'].subscribe();
      }
      const channel = this.channels['staff_broadcast'];
      const payload = { staffId: staffId.toUpperCase(), timestamp: Date.now() };
      if (typeof channel.httpSend === 'function') {
        try {
          await channel.httpSend('STAFF_REVOKED', payload);
        } catch (e1) {
          await channel.httpSend({ type: 'broadcast', event: 'STAFF_REVOKED', payload });
        }
      } else {
        await channel.send({
          type: 'broadcast',
          event: 'STAFF_REVOKED',
          payload
        });
      }
    } catch (e) {}
  }

  // --- Shift Duty Synchronization ---
  async setDutyStatus(staffId, isOnDuty, shiftStartedAt) {
    if (!this.isConfigured || !this.client || !staffId) return false;
    if (this.dutyRpcDisabled && this.dutyColumnsDisabled) return false;

    try {
      const shiftIso = shiftStartedAt ? new Date(shiftStartedAt).toISOString() : null;

      if (!this.dutyRpcDisabled) {
        const { data, error } = await this.client.rpc('set_counselor_duty_status', {
          p_staff_id: staffId.trim(),
          p_is_on_duty: !!isOnDuty,
          p_shift_started_at: shiftIso
        });
        if (!error && data !== undefined) {
          return true;
        }
        if (error && (error.code === 'PGRST202' || error.message?.includes('function') || error.status === 404)) {
          this.dutyRpcDisabled = true;
        }
      }

      if (!this.dutyColumnsDisabled) {
        const { error: updErr } = await this.client
          .from('counselors')
          .update({ is_on_duty: !!isOnDuty, shift_started_at: shiftIso })
          .ilike('staff_id', staffId.trim());
        if (updErr && (updErr.code === '42703' || updErr.message?.includes('column') || updErr.status === 400)) {
          this.dutyColumnsDisabled = true;
          return false;
        }
        return !updErr;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async getDutyStatus(staffId) {
    if (!this.isConfigured || !this.client || !staffId) return null;
    if (this.dutyRpcDisabled && this.dutyColumnsDisabled) return null;

    try {
      if (!this.dutyRpcDisabled) {
        const { data, error } = await this.client.rpc('get_counselor_duty_status', {
          p_staff_id: staffId.trim()
        });
        if (!error && data && data.length > 0) {
          return {
            isOnDuty: !!data[0].is_on_duty,
            shiftStartedAt: data[0].shift_started_at ? new Date(data[0].shift_started_at).getTime() : null
          };
        }
        if (error && (error.code === 'PGRST202' || error.message?.includes('function') || error.status === 404)) {
          this.dutyRpcDisabled = true;
        }
      }

      if (!this.dutyColumnsDisabled) {
        const { data: rows, error: qErr } = await this.client
          .from('counselors')
          .select('is_on_duty, shift_started_at')
          .ilike('staff_id', staffId.trim())
          .limit(1);
        if (qErr && (qErr.code === '42703' || qErr.message?.includes('column') || qErr.status === 400)) {
          this.dutyColumnsDisabled = true;
          return null;
        }
        if (!qErr && rows && rows.length > 0) {
          return {
            isOnDuty: !!rows[0].is_on_duty,
            shiftStartedAt: rows[0].shift_started_at ? new Date(rows[0].shift_started_at).getTime() : null
          };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // --- Profile Management ---
  async updateStaffProfile({ staffId, name, password }) {
    if (!this.isConfigured || !this.client || !staffId) return false;
    try {
      if (!this.profileRpcDisabled) {
        const { data, error } = await this.client.rpc('update_staff_profile', {
          p_staff_id: staffId.trim(),
          p_name: (name || '').trim(),
          p_new_password: password ? password.trim() : null
        });
        if (!error && data) return true;
        if (error && (error.code === 'PGRST202' || error.status === 404)) {
          this.profileRpcDisabled = true;
        }
      }
      const payload = { name: (name || '').trim() };
      const { error: updErr } = await this.client
        .from('counselors')
        .update(payload)
        .ilike('staff_id', staffId.trim());
      return !updErr;
    } catch (e) {
      return false;
    }
  }

  async resetCounselorPassword({ supervisorId, targetStaffId, newPassword, supervisorPassword }) {
    if (!this.isConfigured || !this.client || !targetStaffId || !newPassword) return false;
    try {
      // 1. Try RPC with matching parameter names (p_target_staff_id as defined in schema.sql)
      let res = await this.client.rpc('reset_counselor_password', {
        p_supervisor_id: supervisorId || 'SUPERVISOR',
        p_target_staff_id: targetStaffId.trim(),
        p_new_password: newPassword.trim(),
        p_supervisor_password: supervisorPassword || ''
      });
      // Fallback if schema was deployed with p_target_id parameter name
      if (res.error && (res.error.code === 'PGRST202' || res.error.status === 404 || res.error.message?.includes('schema cache'))) {
        res = await this.client.rpc('reset_counselor_password', {
          p_supervisor_id: supervisorId || 'SUPERVISOR',
          p_target_id: targetStaffId.trim(),
          p_new_password: newPassword.trim(),
          p_supervisor_password: supervisorPassword || ''
        });
      }
      const data = res.data;
      const error = res.error;

      // 2. Broadcast via Supabase Realtime channel so all devices update cache instantly
      try {
        if (!this.channels['staff_broadcast']) {
          this.channels['staff_broadcast'] = this.client.channel('tumaini_staff_channel');
          this.channels['staff_broadcast'].subscribe();
        }
        const channel = this.channels['staff_broadcast'];
        const payload = { staffId: targetStaffId.toUpperCase(), password: newPassword.trim(), timestamp: Date.now() };
        if (typeof channel.httpSend === 'function') {
          try {
            await channel.httpSend('STAFF_PASSWORD_RESET', payload);
          } catch (e1) {
            await channel.httpSend({ type: 'broadcast', event: 'STAFF_PASSWORD_RESET', payload });
          }
        } else {
          await channel.send({
            type: 'broadcast',
            event: 'STAFF_PASSWORD_RESET',
            payload
          });
        }
      } catch (bcErr) {}

      return !error && !!data;
    } catch (e) {
      return false;
    }
  }

  // --- Shift Attendance Logging ---
  async logShiftStart(shift) {
    if (!this.isConfigured || !this.client || !shift || this.shiftsTableDisabled) return false;
    try {
      const { error } = await this.client
        .from('staff_shifts')
        .upsert([{
          id: shift.id,
          staff_id: shift.staffId,
          staff_name: shift.name,
          staff_role: shift.role,
          clock_in_time: new Date(shift.clockInTime).toISOString(),
          clock_out_time: null,
          duration_minutes: null,
          date_str: shift.dateStr
        }], { onConflict: 'id' });
      if (error && (error.code === '42P01' || error.status === 404)) {
        this.shiftsTableDisabled = true;
        return false;
      }
      return !error;
    } catch (e) {
      this.shiftsTableDisabled = true;
      return false;
    }
  }

  async logShiftEnd(shift) {
    if (!this.isConfigured || !this.client || !shift || this.shiftsTableDisabled) return false;
    try {
      const { error } = await this.client
        .from('staff_shifts')
        .update({
          clock_out_time: new Date(shift.clockOutTime || Date.now()).toISOString(),
          duration_minutes: shift.durationMinutes || 0
        })
        .eq('id', shift.id);
      if (error && (error.code === '42P01' || error.status === 404)) {
        this.shiftsTableDisabled = true;
        return false;
      }
      return !error;
    } catch (e) {
      return false;
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
        .upsert([{
          id: intakeData.id,
          alias: intakeData.alias,
          tier: intakeData.tier,
          category: intakeData.category,
          summary: intakeData.summary || '',
          status: intakeData.status || 'waiting',
          seeker_token: intakeData.seekerToken || '',
          created_at: new Date(intakeData.createdAt || Date.now()).toISOString(),
          updated_at: new Date(intakeData.updatedAt || Date.now()).toISOString()
        }], { onConflict: 'id' })
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

      let { data, error } = await this.client
        .from('intake_messages')
        .insert([payload])
        .select();

      // Auto-heal on foreign key constraint 23503 (parent intake not yet committed)
      if (error && error.code === '23503') {
        const localIntake = typeof window !== 'undefined' && typeof window.__tumaini_get_intake === 'function'
          ? window.__tumaini_get_intake(intakeId)
          : null;
        if (localIntake) {
          await this.createIntake({
            id: localIntake.id,
            alias: localIntake.username,
            tier: localIntake.emergencyTier,
            category: localIntake.category,
            summary: localIntake.notes || '',
            status: localIntake.status || 'waiting',
            seekerToken: localIntake.seekerToken || (localIntake.id + '_' + Date.now()),
            createdAt: localIntake.createdAt
          });
          const retryRes = await this.client
            .from('intake_messages')
            .insert([payload])
            .select();
          data = retryRes.data;
          error = retryRes.error;
        }
      }

      if (error) console.error('Error sending message:', error);
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  // --- 4. Confessions ---
  async fetchAllConfessions() {
    if (!this.isConfigured || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('confessions')
        .select('*')
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
      // 1. Try secure RPC function first
      const { data: rpcData, error: rpcErr } = await this.client.rpc('submit_confession_secure', {
        p_id: id || `conf-${Date.now()}`,
        p_username: username,
        p_category: category,
        p_text: text
      });
      if (!rpcErr && rpcData && rpcData.length > 0) {
        return rpcData[0];
      }

      // 2. Direct table insert fallback
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

  subscribeToConfessions(onInsert, onUpdate) {
    if (!this.isConfigured || !this.client) return () => {};

    const channel = this.client
      .channel('public:confessions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'confessions' },
        payload => onInsert && onInsert({
          id: payload.new.id,
          username: payload.new.username,
          category: payload.new.category,
          text: payload.new.text,
          status: payload.new.status,
          empathyCount: payload.new.empathy_count,
          createdAt: new Date(payload.new.created_at).getTime()
        })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'confessions' },
        payload => onUpdate && onUpdate({
          id: payload.new.id,
          username: payload.new.username,
          category: payload.new.category,
          text: payload.new.text,
          status: payload.new.status,
          empathyCount: payload.new.empathy_count,
          createdAt: new Date(payload.new.created_at).getTime()
        })
      )
      .subscribe();

    return () => {
      this.client.removeChannel(channel);
    };
  }
}

export const supabase = new TumainiSupabaseService();
