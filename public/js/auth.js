/* ==========================================================================
   TUMAINI - STAFF AUTHENTICATION & SHIFT DUTY ENGINE
   - Staff Registration with automatic Operator ID generation (STF-XXXX)
   - Secure credential verification & persistent session
   - Shift Clock-In / Clock-Out state tracking
   ========================================================================== */

const STORAGE_KEYS = {
  STAFF_ACCOUNTS: 'haven_staff_accounts_v3',
  ACTIVE_SESSION: 'haven_active_staff_session_v3'
};

class StaffAuthManager {
  constructor() {
    this.accounts = this.loadAccounts();
    this.session = this.loadSession();
    this.subscribers = new Set();
  }

  loadAccounts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STAFF_ACCOUNTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Error reading staff accounts', e);
    }
    const seed = [
      {
        staffId: 'STF-1001',
        name: 'Dr. Sarah Kigozi',
        role: 'Crisis Counselor',
        password: 'counselor',
        registeredAt: Date.now() - 3600000
      },
      {
        staffId: 'STF-7700',
        name: 'Lead Clinical Supervisor',
        role: 'Triage Lead / Shift Supervisor',
        password: 'tumaini2026',
        registeredAt: Date.now() - 7200000
      }
    ];
    try {
      localStorage.setItem(STORAGE_KEYS.STAFF_ACCOUNTS, JSON.stringify(seed));
    } catch (e) {}
    return seed;
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

  register({ name, role, password, supervisorKey }) {
    if (!name || !name.trim()) return { success: false, error: 'Full name is required.' };
    if (!password || password.length < 4) return { success: false, error: 'Password must be at least 4 characters.' };

    const CLINICAL_SUPERVISOR_KEY = 'TUMAINI-CLINICAL-2026';
    if (!supervisorKey || supervisorKey.trim() !== CLINICAL_SUPERVISOR_KEY) {
      return {
        success: false,
        error: 'Unauthorized: Staff registration is strictly restricted. A valid Clinical Supervisor Authorization Key issued by Tumaini administration is required to onboard counseling personnel.'
      };
    }

    const staffId = this.generateStaffId();
    const newStaff = {
      staffId,
      name: name.trim(),
      role: role || 'Crisis Counselor',
      password, // In production this would be hashed on a backend
      registeredAt: Date.now()
    };

    this.accounts.push(newStaff);
    this.saveAccounts();

    return {
      success: true,
      staffId,
      staff: newStaff
    };
  }

  login({ staffId, password }) {
    const trimmedId = (staffId || '').trim().toUpperCase();
    const account = this.accounts.find(acc => acc.staffId === trimmedId && acc.password === password);

    if (!account) {
      return { success: false, error: 'Invalid Staff ID or Password. Please verify credentials or register.' };
    }

    this.session = {
      staffId: account.staffId,
      name: account.name,
      role: account.role,
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
}

export const auth = new StaffAuthManager();
