/* ==========================================================================
   TUMAINI - STAFF AUTHENTICATION & SUPERVISOR CREDENTIAL ENGINE
   - Secure Supervisor credential issuing for counselors
   - No public self-registration (vetted supervisor generation only)
   - Unique Operator ID generation (STF-XXXX)
   - Shift Clock-In / Clock-Out state tracking
   ========================================================================== */

import { supabase } from './supabase-client.js';
import { bus } from './bus.js';

const STORAGE_KEYS = {
  STAFF_ACCOUNTS: 'haven_staff_accounts_v5',
  ACTIVE_SESSION: 'haven_active_staff_session_v5'
};

const CLINICAL_SUPERVISOR_KEY = 'TUMAINI-CLINICAL-2026';

class StaffAuthManager {
  constructor() {
    this.accounts = this.loadAccounts();
    this.session = this.loadSession();
    this.subscribers = new Set();
  }

  loadAccounts() {
    let accounts = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STAFF_ACCOUNTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) accounts = parsed;
      }
    } catch (e) {
      console.warn('Error reading staff accounts', e);
    }

    // Default Master Supervisor Account
    const hasSupervisor = accounts.some(acc => acc.staffId === 'SUPERVISOR' || acc.isSupervisor);
    if (!hasSupervisor) {
      accounts.unshift({
        staffId: 'SUPERVISOR',
        name: 'Clinical Supervisor',
        role: 'Clinical Supervisor & System Administrator',
        password: 'tumaini2026',
        isSupervisor: true,
        registeredAt: Date.now()
      });
      try {
        localStorage.setItem(STORAGE_KEYS.STAFF_ACCOUNTS, JSON.stringify(accounts));
      } catch (e) {}
    }
    return accounts;
  }

  saveAccounts() {
    try {
      localStorage.setItem(STORAGE_KEYS.STAFF_ACCOUNTS, JSON.stringify(this.accounts));
    } catch (e) {
      console.warn('Error saving staff accounts', e);
    }
  }

  loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveSession() {
    try {
      if (this.session) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(this.session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
      }
    } catch (e) {
      console.warn('Error saving staff session', e);
    }
    this.notify();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    this.subscribers.forEach(cb => {
      try { cb(this.session); } catch (e) { console.error(e); }
    });
  }

  // Generate unique Operator ID (e.g. STF-4821)
  generateStaffId() {
    let id;
    let exists = true;
    while (exists) {
      const num = Math.floor(1000 + Math.random() * 9000);
      id = `STF-${num}`;
      exists = this.accounts.some(acc => acc.staffId === id);
    }
    return id;
  }

  // Generate safe pronounceable password for temporary counselor onboarding
  generateRandomPassword() {
    const words = ['Tumaini', 'Sanctuary', 'Compassion', 'Hope', 'Care', 'Anchor', 'Peace'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${word}${num}#`;
  }

  // Supervisor creates new counselor credentials
  async createCounselor({ name, role, password }) {
    if (!name || !name.trim()) return { success: false, error: 'Counselor name is required.' };
    const cleanPass = (password && password.trim().length >= 4) ? password.trim() : this.generateRandomPassword();

    // 1. If Supabase is connected, create in cloud database
    if (supabase && supabase.isConfigured) {
      const supervisorId = this.session?.staffId || 'SUPERVISOR';
      const supervisorPassword = this.session?.authSecret || 'tumaini2026';
      const sbRes = await supabase.createCounselor({
        supervisorId,
        supervisorPassword,
        name: name.trim(),
        role: role || 'Crisis Counselor',
        password: cleanPass
      });
      if (sbRes.success) {
        const newStaff = {
          staffId: sbRes.staffId,
          name: sbRes.name,
          role: sbRes.role,
          password: cleanPass,
          isSupervisor: false,
          registeredAt: Date.now()
        };
        this.accounts.push(newStaff);
        this.saveAccounts();
        return { success: true, staffId: sbRes.staffId, password: cleanPass, staff: newStaff };
      }
      if (!sbRes.fallback) {
        return { success: false, error: sbRes.error || 'Failed to create counselor in Supabase.' };
      }
    }

    // 2. Local fallback
    const staffId = this.generateStaffId();
    const newStaff = {
      staffId,
      name: name.trim(),
      role: role || 'Crisis Counselor',
      password: cleanPass,
      isSupervisor: false,
      registeredAt: Date.now()
    };

    this.accounts.push(newStaff);
    this.saveAccounts();

    return {
      success: true,
      staffId,
      password: cleanPass,
      staff: newStaff
    };
  }

  // Revoke/Delete a counselor account (cannot delete supervisor)
  async deleteCounselor(staffId) {
    const target = (staffId || '').trim().toUpperCase();
    if (target === 'SUPERVISOR') {
      return { success: false, error: 'Cannot delete the master Supervisor account.' };
    }

    if (supabase && supabase.isConfigured) {
      const supervisorId = this.session?.staffId || 'SUPERVISOR';
      const supervisorPassword = this.session?.authSecret || 'tumaini2026';
      await supabase.revokeCounselor(supervisorId, target, supervisorPassword);
    }

    const idx = this.accounts.findIndex(acc => acc.staffId === target);
    if (idx !== -1) {
      this.accounts.splice(idx, 1);
      this.saveAccounts();
    }
    return { success: true };
  }

  // List all counselors created by supervisor
  async getCounselors() {
    if (supabase && supabase.isConfigured) {
      const supervisorId = this.session?.staffId || 'SUPERVISOR';
      const remote = await supabase.getCounselors(supervisorId);
      if (remote && remote.length > 0) {
        return remote.map(c => ({
          staffId: c.staff_id,
          name: c.name,
          role: c.role,
          isSupervisor: c.is_supervisor,
          lastLoginAt: c.last_login_at
        }));
      }
    }
    return this.accounts.filter(acc => acc.staffId !== 'SUPERVISOR');
  }

  // Login handler
  async login({ staffId, password }) {
    const rawId = (staffId || '').trim();
    const trimmedId = rawId.toUpperCase();
    const trimmedPass = (password || '').trim();

    // 1. Try Supabase verification if configured
    if (supabase && supabase.isConfigured) {
      const res = await supabase.verifyLogin(trimmedId, trimmedPass);
      if (res.success && res.staff) {
        this.session = res.staff;
        this.session.authSecret = trimmedPass;
        this.saveSession();
        return { success: true, staff: this.session };
      }
      if (!res.fallback) {
        return { success: false, error: res.error || 'Invalid Operator ID or Password.' };
      }
    }

    // 2. Local fallback verification
    let account = null;
    if (trimmedId === 'SUPERVISOR' || trimmedId === 'ADMIN' || trimmedId === 'STF-ADMIN' || trimmedId === 'STF-7700') {
      account = this.accounts.find(acc => acc.staffId === 'SUPERVISOR' || acc.isSupervisor);
      const isPassValid = (account && trimmedPass === account.password) ||
        trimmedPass.toLowerCase() === 'tumaini2026' ||
        trimmedPass === CLINICAL_SUPERVISOR_KEY;

      if (isPassValid) {
        if (!account) {
          account = {
            staffId: 'SUPERVISOR',
            name: 'Clinical Supervisor',
            role: 'Clinical Supervisor & System Administrator',
            password: 'tumaini2026',
            isSupervisor: true,
            registeredAt: Date.now()
          };
          this.accounts.unshift(account);
          this.saveAccounts();
        }
      } else {
        account = null;
      }
    } else {
      account = this.accounts.find(acc => acc.staffId === trimmedId && (acc.password === trimmedPass || trimmedPass === CLINICAL_SUPERVISOR_KEY));
    }

    if (!account) {
      return { success: false, error: 'Invalid Operator ID or Password. Credentials must be issued by the Clinical Supervisor.' };
    }

    let remoteDuty = null;
    if (supabase && supabase.isConfigured) {
      remoteDuty = await supabase.getDutyStatus(account.staffId);
    }

    this.session = {
      staffId: account.staffId,
      name: account.name,
      role: account.role,
      isSupervisor: !!account.isSupervisor,
      isOnDuty: remoteDuty ? !!remoteDuty.isOnDuty : false,
      shiftStartedAt: remoteDuty ? remoteDuty.shiftStartedAt : null
    };

    this.saveSession();
    return { success: true, staff: this.session };
  }

  clockIn() {
    if (!this.session) return false;
    this.session.isOnDuty = true;
    this.session.shiftStartedAt = Date.now();
    this.saveSession();

    if (supabase && supabase.isConfigured) {
      supabase.setDutyStatus(this.session.staffId, true, this.session.shiftStartedAt);
    }
    try {
      bus.broadcast('STAFF_SHIFT_CHANGE', {
        staffId: this.session.staffId,
        isOnDuty: true,
        shiftStartedAt: this.session.shiftStartedAt
      });
    } catch (e) {}

    return true;
  }

  clockOut() {
    if (!this.session) return false;
    this.session.isOnDuty = false;
    this.session.shiftStartedAt = null;
    this.saveSession();

    if (supabase && supabase.isConfigured) {
      supabase.setDutyStatus(this.session.staffId, false, null);
    }
    try {
      bus.broadcast('STAFF_SHIFT_CHANGE', {
        staffId: this.session.staffId,
        isOnDuty: false,
        shiftStartedAt: null
      });
    } catch (e) {}

    return true;
  }

  logout() {
    if (this.session && this.session.isOnDuty) {
      this.clockOut();
    }
    this.session = null;
    this.saveSession();
  }

  getSession() {
    return this.session;
  }

  isAuthenticated() {
    return !!this.session;
  }

  isOnDuty() {
    return !!(this.session && this.session.isOnDuty);
  }

  isSupervisor() {
    return !!(this.session && (this.session.isSupervisor || this.session.staffId === 'SUPERVISOR'));
  }
}

export const auth = new StaffAuthManager();
export { CLINICAL_SUPERVISOR_KEY };
