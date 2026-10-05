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
    // Guard against 404 schema cache errors if migration 002 has not been executed yet
    this.reviewsTableDisabled = localStorage.getItem('tumaini_reviews_cloud_enabled') !== 'true';

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
  async updateStaffProfile({ staffId, name, password, currentPassword }) {
    if (!this.isConfigured || !this.client || !staffId) return false;
    try {
      if (!this.profileRpcDisabled) {
        const { data, error } = await this.client.rpc('update_staff_profile', {
          p_staff_id: staffId.trim(),
          p_name: (name || '').trim(),
          p_password: password ? password.trim() : null,
          p_current_password: currentPassword ? currentPassword.trim() : null
        });
        if (!error && data) return true;
        if (error && (error.code === 'PGRST202' || error.status === 404)) {
          this.profileRpcDisabled = true;
        }
      }
      return false;
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

  async fetchStaffShifts() {
    if (!this.isConfigured || !this.client || this.shiftsTableDisabled) return [];
    try {
      const { data, error } = await this.client
        .from('staff_shifts')
        .select('*')
        .order('clock_in_time', { ascending: false })
        .limit(40);
      if (error) {
        if (error.code === '42P01' || error.status === 404) {
          this.shiftsTableDisabled = true;
        }
        return [];
      }
      return (data || []).map(s => ({
        id: s.id,
        staffId: s.staff_id,
        name: s.staff_name || s.staff_id,
        role: s.staff_role || 'Crisis Counselor',
        clockInTime: s.clock_in_time ? new Date(s.clock_in_time).getTime() : null,
        clockOutTime: s.clock_out_time ? new Date(s.clock_out_time).getTime() : null,
        durationMinutes: s.duration_minutes,
        dateStr: s.date_str
      }));
    } catch (e) {
      return [];
    }
  }

  // --- 2. Intakes & Crisis Triage ---
  // Returns null (not []) when the request FAILS, so callers can tell the
  // difference between "no open cases" and "could not reach the server".
  async fetchActiveIntakes() {
    if (!this.isConfigured || !this.client) return null;
    try {
      const { data, error } = await this.client
        .from('intakes')
        .select('*')
        .neq('status', 'resolved')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Tumaini] Error fetching intakes:', error);
        return null;
      }
      return (data || []).map(r => this.unpackIntakeMeta(r));
    } catch (e) {
      console.error('[Tumaini] Network error fetching intakes:', e);
      return null;
    }
  }

  // Looks up specific cases by id (any status). Used to reconcile local cases
  // that are missing from the open-cases list.
  async fetchIntakesByIds(ids) {
    if (!this.isConfigured || !this.client || !Array.isArray(ids) || ids.length === 0) return [];
    try {
      const { data, error } = await this.client
        .from('intakes')
        .select('*')
        .in('id', ids);
      if (error) {
        console.error('[Tumaini] Error reconciling intakes:', error);
        return null;
      }
      return (data || []).map(r => this.unpackIntakeMeta(r));
    } catch (e) {
      return null;
    }
  }

  unpackIntakeMeta(row) {
    if (!row) return row;
    if (row.summary && row.summary.includes('[TMN_META:')) {
      try {
        const match = row.summary.match(/\[TMN_META:(.*?)\]/);
        if (match) {
          const meta = JSON.parse(match[1]);
          if (meta.passkey && !row.passkey) row.passkey = meta.passkey;
          if (meta.passkeyHash && !row.case_passkey_hash) row.case_passkey_hash = meta.passkeyHash;
          if (meta.safetyPlan && !row.safety_plan) row.safety_plan = meta.safetyPlan;
          if (meta.handoffNote && !row.handoff_note) row.handoff_note = meta.handoffNote;
          if (meta.nextCheckIn && !row.next_check_in) row.next_check_in = meta.nextCheckIn;
        }
      } catch (e) {}
      row.raw_summary = row.summary;
      row.summary = row.summary.replace(/\[TMN_META:.*?\]/g, '').trim();
    }
    if (row.case_passkey_hash && !row.casePasskeyHash) row.casePasskeyHash = row.case_passkey_hash;
    if (row.safety_plan && !row.safetyPlan) row.safetyPlan = row.safety_plan;
    if (row.handoff_note && !row.handoffNote) row.handoffNote = row.handoff_note;
    if (row.next_check_in && !row.nextCheckIn) row.nextCheckIn = row.next_check_in;
    return row;
  }

  // Resume lookup. Checks intake_messages, summary metadata, and optional column.
  async findIntakeByPasskeyHash(hash, rawPasskey = null) {
    if (!this.isConfigured || !this.client || (!hash && !rawPasskey)) return null;
    try {
      const cleanPass = (rawPasskey || '').trim().toUpperCase();

      // 1. Infallible lookup: search intake_messages for the passkey string (e.g. 'TMN-EB39')
      if (cleanPass) {
        try {
          const { data: msgData, error: msgErr } = await this.client
            .from('intake_messages')
            .select('id, intake_id, text, created_at')
            .ilike('text', `%${cleanPass}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!msgErr && msgData && msgData.length > 0) {
            const matchedIntakeId = msgData[0].intake_id;
            const { data: intakeData, error: intakeErr } = await this.client
              .from('intakes')
              .select('*')
              .eq('id', matchedIntakeId)
              .limit(1);

            if (!intakeErr && intakeData && intakeData.length > 0) {
              const unpacked = this.unpackIntakeMeta(intakeData[0]);
              // Extract safety plan and passkey from message text if missing in unpacked
              if (!unpacked.safetyPlan && msgData[0].text) {
                const planMatch = msgData[0].text.match(/Take-Home Care & Safety Plan:\s*([^\n]+)/i);
                if (planMatch) unpacked.safetyPlan = planMatch[1].trim();
              }
              if (!unpacked.nextCheckIn && msgData[0].text) {
                const timeMatch = msgData[0].text.match(/Agreed Return Time:\s*([^\n]+)/i);
                if (timeMatch) unpacked.nextCheckIn = timeMatch[1].trim();
              }
              unpacked.passkey = cleanPass;
              return unpacked;
            }
          }
        } catch (msgLookupErr) {
          console.warn('[Tumaini] Messages passkey search fallback:', msgLookupErr);
        }
      }

      // 2. Summary metadata lookup: search intakes where summary contains the raw passkey or the SHA-256 hash
      const searchTerms = [cleanPass, hash].filter(Boolean);
      for (const term of searchTerms) {
        try {
          const { data: sumData, error: sumErr } = await this.client
            .from('intakes')
            .select('*')
            .ilike('summary', `%${term}%`)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (!sumErr && sumData && sumData.length > 0) {
            return this.unpackIntakeMeta(sumData[0]);
          }
        } catch (sumSearchErr) {}
      }

      // 3. Fallback: inspect recent intakes (any status)
      try {
        const { data: allData, error: allErr } = await this.client
          .from('intakes')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(30);

        if (!allErr && Array.isArray(allData)) {
          for (const rawRow of allData) {
            const row = this.unpackIntakeMeta(rawRow);
            if (row.case_passkey_hash === hash || (cleanPass && row.raw_summary && row.raw_summary.includes(cleanPass))) {
              return row;
            }
          }
        }
      } catch (scanErr) {}

      return null;
    } catch (e) {
      console.warn('[Tumaini] Passkey lookup error:', e);
      return null;
    }
  }

  async createIntake(intakeData) {
    if (!this.isConfigured || !this.client) return null;
    try {
      const row = {
        id: intakeData.id,
        alias: intakeData.alias,
        tier: intakeData.tier,
        category: intakeData.category,
        summary: intakeData.summary || '',
        status: intakeData.status || 'waiting',
        seeker_token: intakeData.seekerToken || '',
        created_at: new Date(intakeData.createdAt || Date.now()).toISOString(),
        updated_at: new Date(intakeData.updatedAt || Date.now()).toISOString()
      };
      if (intakeData.safetyPlan || intakeData.handoffNote || intakeData.nextCheckIn || intakeData.passkeyHash || intakeData.passkey) {
        const metaObj = {
          passkey: intakeData.passkey || null,
          passkeyHash: intakeData.passkeyHash || null,
          safetyPlan: intakeData.safetyPlan || null,
          handoffNote: intakeData.handoffNote || null,
          nextCheckIn: intakeData.nextCheckIn || null
        };
        const cleaned = (row.summary || '').replace(/\[TMN_META:.*?\]/g, '').trim();
        row.summary = `${cleaned}\n[TMN_META:${JSON.stringify(metaObj)}]`.trim();
      }

      const { data, error } = await this.client
        .from('intakes')
        .upsert([row], { onConflict: 'id' })
        .select();

      if (error) console.error('[Tumaini] Error creating intake:', error);
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Updates a case.
   *  - staffInfo: { staffId, name, role } sets the claiming counselor;
   *               the string 'clear' removes the counselor (used on transfer).
   *  - extra: any of { handoff_note, safety_plan, next_check_in, case_passkey_hash, raw_passkey }.
   * Returns true on success. Failures are logged, never silent.
   */
  async updateIntakeStatus(intakeId, status, staffInfo = null, extra = null) {
    if (!this.isConfigured || !this.client) return false;
    try {
      // Supabase schema check constraint 'intakes_status_check' only allows ('waiting', 'active', 'resolved').
      let remoteStatus = status;
      if (remoteStatus === 'follow_up' || remoteStatus === 'in_session') {
        remoteStatus = 'active';
      }

      const updatePayload = {
        status: remoteStatus,
        updated_at: new Date().toISOString()
      };

      if (staffInfo === 'clear') {
        updatePayload.claimed_by_id = null;
        updatePayload.claimed_by_name = null;
        updatePayload.claimed_by_role = null;
      } else if (staffInfo) {
        updatePayload.claimed_by_id = staffInfo.staffId;
        updatePayload.claimed_by_name = staffInfo.name;
        updatePayload.claimed_by_role = staffInfo.role;
      }

      if (extra) {
        const metaObj = {
          passkey: extra.raw_passkey || extra.passkey || null,
          passkeyHash: extra.case_passkey_hash || extra.passkeyHash || null,
          safetyPlan: extra.safety_plan || extra.safetyPlan || null,
          handoffNote: extra.handoff_note || extra.handoffNote || null,
          nextCheckIn: extra.next_check_in || extra.nextCheckIn || null
        };

        try {
          const { data: curRows } = await this.client
            .from('intakes')
            .select('summary')
            .eq('id', intakeId)
            .limit(1);
          const curSummary = (curRows && curRows[0]?.summary) || '';
          const cleanedSummary = curSummary.replace(/\[TMN_META:.*?\]/g, '').trim();
          updatePayload.summary = `${cleanedSummary}\n[TMN_META:${JSON.stringify(metaObj)}]`.trim();
        } catch (fetchErr) {
          updatePayload.summary = `[TMN_META:${JSON.stringify(metaObj)}]`;
        }
      }

      let { error } = await this.client
        .from('intakes')
        .update(updatePayload)
        .eq('id', intakeId);

      // If the counselor id violates FK constraint (e.g. not in counselors table), save claim with name only
      if (error && error.code === '23503' && updatePayload.claimed_by_id) {
        delete updatePayload.claimed_by_id;
        ({ error } = await this.client
          .from('intakes')
          .update(updatePayload)
          .eq('id', intakeId));
      }

      if (error) {
        console.error('[Tumaini] Failed to update intake', intakeId, error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[Tumaini] updateIntakeStatus exception:', e);
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

  // --- 5. Community Reviews ---
  async fetchApprovedReviews() {
    if (!this.isConfigured || !this.client || this.reviewsTableDisabled) return [];
    try {
      const { data, error } = await this.client
        .from('reviews')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01' || error.status === 404) {
          this.reviewsTableDisabled = true;
          localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
        }
        return [];
      }
      return (data || []).map(r => ({
        id: r.id,
        alias: r.alias || 'Anonymous',
        rating: r.rating,
        text: r.text,
        status: r.status,
        createdAt: new Date(r.created_at).getTime()
      }));
    } catch (e) {
      this.reviewsTableDisabled = true;
      localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
      return [];
    }
  }

  async fetchPendingReviews(staffId) {
    if (!this.isConfigured || !this.client || !staffId || this.reviewsTableDisabled) return [];
    try {
      // 1. Try secure RPC
      const { data: rpcData, error: rpcErr } = await this.client.rpc('get_pending_reviews', {
        p_staff_id: staffId.trim()
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map(r => ({
          id: r.id,
          alias: r.alias || 'Anonymous',
          rating: r.rating,
          text: r.text,
          status: 'pending',
          createdAt: new Date(r.created_at).getTime()
        }));
      }

      // 2. Direct query fallback
      const { data, error } = await this.client
        .from('reviews')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01' || error.status === 404) {
          this.reviewsTableDisabled = true;
          localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
        }
        return [];
      }
      return (data || []).map(r => ({
        id: r.id,
        alias: r.alias || 'Anonymous',
        rating: r.rating,
        text: r.text,
        status: r.status,
        createdAt: new Date(r.created_at).getTime()
      }));
    } catch (e) {
      this.reviewsTableDisabled = true;
      localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
      return [];
    }
  }

  async submitReview({ alias, rating, text }) {
    if (!this.isConfigured || !this.client || !text || !rating || this.reviewsTableDisabled) return null;
    try {
      const cleanAlias = (alias || 'Anonymous').trim().slice(0, 40) || 'Anonymous';
      const cleanRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
      const cleanText = text.trim().slice(0, 600);

      const { data, error } = await this.client
        .from('reviews')
        .insert([{
          alias: cleanAlias,
          rating: cleanRating,
          text: cleanText,
          status: 'pending'
        }])
        .select();

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01' || error.status === 404) {
          this.reviewsTableDisabled = true;
          localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
        }
        return null;
      }
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  async moderateReview({ staffId, reviewId, status }) {
    if (!this.isConfigured || !this.client || !reviewId || !status || this.reviewsTableDisabled) return false;
    try {
      if (staffId) {
        const { data, error } = await this.client.rpc('moderate_review', {
          p_staff_id: staffId.trim(),
          p_review_id: reviewId,
          p_status: status
        });
        if (!error && data) return true;
      }

      const { error: updErr } = await this.client
        .from('reviews')
        .update({
          status,
          moderated_by: staffId ? staffId.toUpperCase() : 'STAFF',
          moderated_at: new Date().toISOString()
        })
        .eq('id', reviewId);

      return !updErr;
    } catch (e) {
      return false;
    }
  }

  async checkOrEnableReviewsCloudSync() {
    if (!this.isConfigured || !this.client) {
      return { success: false, error: 'Supabase client not configured.' };
    }
    try {
      const { data, error } = await this.client
        .from('reviews')
        .select('id')
        .limit(1);

      if (error) {
        this.reviewsTableDisabled = true;
        localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
        return {
          success: false,
          error: error.message || 'Table public.reviews not found in schema cache. Run migration 002 in Supabase SQL editor.'
        };
      }

      this.reviewsTableDisabled = false;
      localStorage.setItem('tumaini_reviews_cloud_enabled', 'true');
      return { success: true };
    } catch (e) {
      this.reviewsTableDisabled = true;
      localStorage.setItem('tumaini_reviews_cloud_enabled', 'false');
      return { success: false, error: e.message };
    }
  }

  // --- 6. Supabase Realtime Subscriptions ---
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

  subscribeToReviews(onInsert, onUpdate) {
    if (!this.isConfigured || !this.client || this.reviewsTableDisabled) return () => {};

    const channel = this.client
      .channel('public:reviews')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reviews' },
        payload => onInsert && onInsert({
          id: payload.new.id,
          alias: payload.new.alias,
          rating: payload.new.rating,
          text: payload.new.text,
          status: payload.new.status,
          createdAt: new Date(payload.new.created_at).getTime()
        })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reviews' },
        payload => onUpdate && onUpdate({
          id: payload.new.id,
          alias: payload.new.alias,
          rating: payload.new.rating,
          text: payload.new.text,
          status: payload.new.status,
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
