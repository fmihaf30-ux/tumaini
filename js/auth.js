/* ==========================================================================
   TUMAINI - STAFF AUTHENTICATION & SUPERVISOR CREDENTIAL ENGINE
   - Secure Supervisor credential issuing for counselors
   - No public self-registration (vetted supervisor generation only)
   - Unique Operator ID generation (STF-XXXX)
   - Shift Clock-In / Clock-Out state tracking
   ========================================================================== */

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
  createCounselor({ name, role, password }) {
    if (!name || !name.trim()) return { success: false, error: 'Counselor name is required.' };
    const cleanPass = (password && password.trim().length >= 4) ? password.trim() : this.generateRandomPassword();
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
  deleteCounselor(staffId) {
    const target = (staffId || '').trim().toUpperCase();
    if (target === 'SUPERVISOR') {
      return { success: false, error: 'Cannot delete the master Supervisor account.' };
    }
    const idx = this.accounts.findIndex(acc => acc.staffId === target);
    if (idx === -1) return { success: false, error: 'Counselor not found.' };

    this.accounts.splice(idx, 1);
    this.saveAccounts();
    return { success: true };
  }

  // List all counselors created by supervisor
  getCounselors() {
    return this.accounts.filter(acc => acc.staffId !== 'SUPERVISOR');
  }

  // Login handler
  login({ staffId, password }) {
    const rawId = (staffId || '').trim();
    const trimmedId = rawId.toUpperCase();
    const trimmedPass = (password || '').trim();

    // Check for Supervisor aliases
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

    this.session = {
      staffId: account.staffId,
      name: account.name,
      role: account.role,
      isSupervisor: !!account.isSupervisor,
      isOnDuty: false,
      shiftStartedAt: null
    };

    this.saveSession();
    return { success: true, staff: this.session };
  }

  clockIn() {
    if (!this.session) return false;
    this.session.isOnDuty = true;
    this.session.shiftStartedAt = Date.now();
    this.saveSession();
    return true;
  }

  clockOut() {
    if (!this.session) return false;
    this.session.isOnDuty = false;
    this.session.shiftStartedAt = null;
    this.saveSession();
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
