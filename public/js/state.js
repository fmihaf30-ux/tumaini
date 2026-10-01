/* ==========================================================================
   HAVEN SANCTUARY - STATE MANAGEMENT ENGINE
   - Emergency severity tiering & triage classification
   - Real-time case tracking, queue sorting, and message repository
   - Local persistence with fallback seed cases
   ========================================================================== */

export const EMERGENCY_TIERS = {
  'tier-1': {
    id: 'tier-1',
    rank: 1,
    title: 'Tier 1: Critical Crisis / Immediate Risk',
    shortTitle: 'Critical Crisis',
    tag: 'CRITICAL',
    color: '#ef4444',
    badgeClass: 'badge-tier-1',
    dotClass: 'dot-tier-1',
    isEmergency: true,
    description: 'Acute crisis, suicidal thoughts, or immediate harm danger.'
  },
  'tier-2': {
    id: 'tier-2',
    rank: 2,
    title: 'Tier 2: Acute Panic / Severe Emotional Attack',
    shortTitle: 'Acute Panic',
    tag: 'ACUTE PANIC',
    color: '#f59e0b',
    badgeClass: 'badge-tier-2',
    dotClass: 'dot-tier-2',
    isEmergency: true,
    description: 'Hyperventilating, intense sensory overload, severe panic.'
  },
  'tier-3': {
    id: 'tier-3',
    rank: 3,
    title: 'Tier 3: Overwhelmed / At Breaking Point',
    shortTitle: 'Overwhelmed',
    tag: 'ELEVATED',
    color: '#eab308',
    badgeClass: 'badge-tier-3',
    dotClass: 'dot-tier-3',
    isEmergency: false,
    description: 'Exhausted, tearful, acute burnout, but stable.'
  },
  'tier-4': {
    id: 'tier-4',
    rank: 4,
    title: 'Tier 4: Standard / Seeking A Safe Space',
    shortTitle: 'Standard Support',
    tag: 'STANDARD',
    color: '#0ea5e9',
    badgeClass: 'badge-tier-4',
    dotClass: 'dot-tier-4',
    isEmergency: false,
    description: 'Need a warm listener to unpack thoughts and vent safely.'
  }
};

export const CATEGORIES = {
  anxiety: { id: 'anxiety', label: 'Anxiety & Panic', icon: '•' },
  burnout: { id: 'burnout', label: 'Burnout & Overwhelm', icon: '•' },
  loneliness: { id: 'loneliness', label: 'Loneliness & Isolation', icon: '•' },
  grief: { id: 'grief', label: 'Grief & Loss', icon: '•' },
  relationship: { id: 'relationship', label: 'Relationship Strain', icon: '•' },
  depression: { id: 'depression', label: 'Heavy Mood & Sadness', icon: '•' },
  vent: { id: 'vent', label: 'Just Need to Vent', icon: '•' }
};

const STORAGE_KEYS = {
  CASES: 'haven_cases_v2',
  MESSAGES: 'haven_messages_v2',
  ACTIVE_USER_CASE: 'haven_active_user_case_v2',
  ACTIVE_STAFF_CASE: 'haven_active_staff_case_v2'
};

class StateManager {
  constructor() {
    this.listeners = new Set();
    this.cases = this.loadCases();
    this.messages = this.loadMessages();
    this.activeUserCaseId = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_CASE) || null;
    this.activeStaffCaseId = localStorage.getItem(STORAGE_KEYS.ACTIVE_STAFF_CASE) || null;
  }

  // Initial Seed Data to showcase the queue sorted by emergency type on first load
  getInitialSeedCases() {
    const now = Date.now();
    return [
      {
        id: 'case-alpha-101',
        pseudonym: 'SilentSky',
        category: 'grief',
        emergencyTier: 'tier-1',
        isEmergency: true,
        createdAt: now - (95 * 1000), // 1m 35s ago
        status: 'waiting',
        counselorName: null,
        notes: 'User indicated deep despair following recent sudden loss.',
        checklist: { harmCheck: false, groundingOffered: false, hotlineProvided: false }
      },
      {
        id: 'case-beta-204',
        pseudonym: 'BraveSparrow',
        category: 'anxiety',
        emergencyTier: 'tier-2',
        isEmergency: true,
        createdAt: now - (240 * 1000), // 4m ago
        status: 'waiting',
        counselorName: null,
        notes: 'Experiencing rapid heart rate and feeling dizzy from panic.',
        checklist: { harmCheck: false, groundingOffered: false, hotlineProvided: false }
      },
      {
        id: 'case-gamma-308',
        pseudonym: 'CedarBreeze',
        category: 'burnout',
        emergencyTier: 'tier-3',
        isEmergency: false,
        createdAt: now - (480 * 1000), // 8m ago
        status: 'waiting',
        counselorName: null,
        notes: 'Work exhaustion causing sleep deprivation and feelings of failure.',
        checklist: { harmCheck: false, groundingOffered: false, hotlineProvided: false }
      },
      {
        id: 'case-delta-415',
        pseudonym: 'WillowLight',
        category: 'vent',
        emergencyTier: 'tier-4',
        isEmergency: false,
        createdAt: now - (720 * 1000), // 12m ago
        status: 'waiting',
        counselorName: null,
        notes: 'Just looking for a supportive listener to process a difficult day.',
        checklist: { harmCheck: false, groundingOffered: false, hotlineProvided: false }
      }
    ];
  }

  getInitialSeedMessages() {
    const now = Date.now();
    return {
      'case-alpha-101': [
        {
          id: 'msg-1',
          caseId: 'case-alpha-101',
          sender: 'system',
          senderName: 'Haven Safety Protocol',
          text: 'Emergency Tier 1 logged. 24/7 crisis hotlines (988 Lifeline) have been shared with user.',
          timestamp: now - (90 * 1000)
        },
        {
          id: 'msg-2',
          caseId: 'case-alpha-101',
          sender: 'user',
          senderName: 'SilentSky',
          text: 'Everything feels too heavy tonight. I do not know where to turn.',
          timestamp: now - (85 * 1000)
        }
      ],
      'case-beta-204': [
        {
          id: 'msg-3',
          caseId: 'case-beta-204',
          sender: 'system',
          senderName: 'Haven Notice',
          text: 'Intake completed: Acute Panic selected. Box breathing tools dispatched.',
          timestamp: now - (235 * 1000)
        },
        {
          id: 'msg-4',
          caseId: 'case-beta-204',
          sender: 'user',
          senderName: 'BraveSparrow',
          text: 'My chest feels tight and my hands are shaking. Can someone help me calm down?',
          timestamp: now - (220 * 1000)
        }
      ]
    };
  }

  loadCases() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CASES);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Error reading cases from localStorage', e);
    }
    const seed = this.getInitialSeedCases();
    this.saveCases(seed);
    return seed;
  }

  saveCases(cases = this.cases) {
    this.cases = cases;
    try {
      localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
    } catch (e) {
      console.warn('Error saving cases to localStorage', e);
    }
    this.notify();
  }

  loadMessages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Error reading messages from localStorage', e);
    }
    const seed = this.getInitialSeedMessages();
    this.saveMessages(seed);
    return seed;
  }

  saveMessages(messages = this.messages) {
    this.messages = messages;
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.warn('Error saving messages to localStorage', e);
    }
    this.notify();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => {
      try { cb(this); } catch (e) { console.error('Error in state subscriber', e); }
    });
  }

  // --- Case Operations ---
  createCase({ pseudonym, category, emergencyTier, notes }) {
    const tierMeta = EMERGENCY_TIERS[emergencyTier] || EMERGENCY_TIERS['tier-4'];
    const newCase = {
      id: 'case-' + Math.random().toString(36).substring(2, 9),
      pseudonym: pseudonym.trim() || 'GentleSoul',
      category: category || 'anxiety',
      emergencyTier: tierMeta.id,
      isEmergency: tierMeta.isEmergency,
      createdAt: Date.now(),
      status: 'waiting',
      counselorName: null,
      notes: notes || '',
      checklist: { harmCheck: false, groundingOffered: false, hotlineProvided: false }
    };

    const updated = [newCase, ...this.cases];
    this.saveCases(updated);

    // Initial system greeting message
    this.addMessage({
      caseId: newCase.id,
      sender: 'system',
      senderName: 'Sanctuary Guide',
      text: `Welcome, ${newCase.pseudonym}. You are in a secure, confidential space. A counselor has been notified with your ${tierMeta.shortTitle} triage priority.`
    });

    if (tierMeta.isEmergency) {
      this.addMessage({
        caseId: newCase.id,
        sender: 'system',
        senderName: 'Emergency Support Notice',
        text: `⚠️ Emergency Alert: If you are in immediate life-threatening physical danger, please call emergency services or 988 immediately. We are connecting you to an available crisis counselor right now.`
      });
    }

    this.setActiveUserCase(newCase.id);
    return newCase;
  }

  setActiveUserCase(caseId) {
    this.activeUserCaseId = caseId;
    if (caseId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_CASE, caseId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER_CASE);
    }
    this.notify();
  }

  setActiveStaffCase(caseId) {
    this.activeStaffCaseId = caseId;
    if (caseId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_STAFF_CASE, caseId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_STAFF_CASE);
    }
    this.notify();
  }

  getActiveUserCase() {
    return this.cases.find(c => c.id === this.activeUserCaseId) || null;
  }

  getActiveStaffCase() {
    return this.cases.find(c => c.id === this.activeStaffCaseId) || null;
  }

  updateCaseStatus(caseId, status, counselorName = null) {
    const updated = this.cases.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          status,
          counselorName: counselorName !== null ? counselorName : c.counselorName
        };
      }
      return c;
    });
    this.saveCases(updated);
  }

  updateCaseNotes(caseId, notes) {
    const updated = this.cases.map(c => c.id === caseId ? { ...c, notes } : c);
    this.saveCases(updated);
  }

  updateChecklist(caseId, key, value) {
    const updated = this.cases.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          checklist: { ...c.checklist, [key]: value }
        };
      }
      return c;
    });
    this.saveCases(updated);
  }

  // --- Dynamic Emergency Tier Queue Sorting ---
  // The user explicitly requested: "queue basing on type of emergency"
  getCasesSortedByEmergency(tierFilter = 'all') {
    let filtered = [...this.cases];

    if (tierFilter !== 'all') {
      filtered = filtered.filter(c => c.emergencyTier === tierFilter);
    }

    return filtered.sort((a, b) => {
      // Unresolved/waiting cases come first
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (b.status === 'resolved' && a.status !== 'resolved') return -1;

      const rankA = EMERGENCY_TIERS[a.emergencyTier]?.rank ?? 99;
      const rankB = EMERGENCY_TIERS[b.emergencyTier]?.rank ?? 99;

      // 1. Rank by Emergency Tier (Tier 1 Critical Crisis < Tier 2 Panic < Tier 3 Overwhelmed < Tier 4 Standard)
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 2. If same tier, sort by longest wait time (oldest created first)
      return a.createdAt - b.createdAt;
    });
  }

  // --- Messages Operations ---
  getMessagesForCase(caseId) {
    return this.messages[caseId] || [];
  }

  addMessage({ caseId, sender, senderName, text }) {
    if (!caseId || !text.trim()) return null;

    const newMsg = {
      id: 'msg-' + Math.random().toString(36).substring(2, 9),
      caseId,
      sender, // 'user' | 'counselor' | 'system'
      senderName,
      text: text.trim(),
      timestamp: Date.now()
    };

    const caseMsgs = this.messages[caseId] ? [...this.messages[caseId], newMsg] : [newMsg];
    const updatedAll = { ...this.messages, [caseId]: caseMsgs };

    this.saveMessages(updatedAll);
    return newMsg;
  }
}

export const state = new StateManager();
