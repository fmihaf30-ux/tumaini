/* ==========================================================================
   TUMAINI - CENTRAL REPOSITORY (ZERO DEMO DATA)
   - 1-on-1 Staff Emergency Intake & Triage
   - Staff-Assigned Group Rooms & Invitations
   - Moderated Confession Room (Staff Approval Pipeline)
   - Zero hardcoded mock tickets or messages
   ========================================================================== */

import { supabase } from './supabase-client.js';

export const EMERGENCY_TIERS = {
  'tier-1': {
    id: 'tier-1',
    rank: 1,
    title: 'Tier 1: Critical Crisis / Immediate Danger',
    shortTitle: 'Critical Crisis',
    tag: 'CRITICAL',
    color: '#e63946',
    badgeClass: 'badge-t1',
    isEmergency: true,
    description: 'Acute self-harm risk, severe danger, or life-threatening crisis.'
  },
  'tier-2': {
    id: 'tier-2',
    rank: 2,
    title: 'Tier 2: Urgent / Acute Panic Attack',
    shortTitle: 'Acute Panic',
    tag: 'URGENT',
    color: '#f59e0b',
    badgeClass: 'badge-t2',
    isEmergency: true,
    description: 'Hyperventilating, racing heartbeat, or intense panic distress.'
  },
  'tier-3': {
    id: 'tier-3',
    rank: 3,
    title: 'Tier 3: Elevated / Breaking Point',
    shortTitle: 'Elevated',
    tag: 'ELEVATED',
    color: '#eab308',
    badgeClass: 'badge-t3',
    isEmergency: false,
    description: 'Completely overwhelmed and exhausted, but currently safe.'
  },
  'tier-4': {
    id: 'tier-4',
    rank: 4,
    title: 'Tier 4: Normal / Safe Space',
    shortTitle: 'Normal',
    tag: 'NORMAL',
    color: '#52b788',
    badgeClass: 'badge-t4',
    isEmergency: false,
    description: 'Looking for a warm, caring listener to process emotions safely.'
  }
};

export const PRESET_CATEGORIES = [
  'Anxiety & Stress',
  'Grief & Loss',
  'Relationships & Family',
  'Late Night & Insomnia',
  'Academic & Tuition Pressure',
  'General Emotional Strain'
];

export const STORAGE_KEYS = {
  INTAKES: 'tumaini_intakes_clean_v3',
  INTAKE_MESSAGES: 'tumaini_intake_messages_clean_v3',
  GROUP_ROOMS: 'tumaini_group_rooms_clean_v3',
  GROUP_MESSAGES: 'tumaini_group_messages_clean_v3',
  CONFESSIONS: 'tumaini_confessions_clean_v3',
  ACTIVE_USER_INTAKE: 'tumaini_active_user_intake_clean_v3',
  ACTIVE_STAFF_INTAKE: 'tumaini_active_staff_intake_clean_v3'
};

class TumainiStore {
  constructor() {
    this.subscribers = new Set();
    this.intakes = this.load(STORAGE_KEYS.INTAKES, []);
    this.intakeMessages = this.load(STORAGE_KEYS.INTAKE_MESSAGES, {});
    this.groupRooms = this.load(STORAGE_KEYS.GROUP_ROOMS, []);
    this.groupMessages = this.load(STORAGE_KEYS.GROUP_MESSAGES, {});
    this.confessions = this.load(STORAGE_KEYS.CONFESSIONS, []);

    this.activeUserIntakeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_INTAKE) || null;
    this.activeStaffIntakeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_STAFF_INTAKE) || null;

    this.purgeOldSessions();
    this.initSupabaseSync();

    // All demo intakes and demo tickets removed: queue begins 100% clean

    if (this.confessions.length === 0 || this.confessions.length > 3 || this.confessions.some(c => c.id === 'conf-101' || c.id === 'campus-conf-104') || localStorage.getItem('tumaini_campus_confessions_clean_v5') !== 'true') {
      this.confessions = [
        {
          id: 'campus-conf-101',
          username: 'Anonymous Fresher · Makerere',
          category: 'Tuition & Exam Permits',
          text: 'Exams start on Monday and my portal is blocked because my father could not raise the remaining 480k functional fees. Everyone in my discussion group in CEDAT is talking about exam permits and sitting arrangements. I sat on the grass near Lumumba pretending to read, but my chest feels like it is in a vice. I have not slept in three days. I do not know how to look my mother in the eyes when she calls.',
          createdAt: Date.now() - 3600000 * 2,
          status: 'approved',
          empathyCount: 47
        },
        {
          id: 'campus-conf-102',
          username: 'Quiet Soul · MUBS Nakawa',
          category: 'Imposter Syndrome & Money',
          text: 'Everyone around my hostel dresses like their parents run ministries and spend 50k on drinks like it is water. Back home in Bushenyi, my mother sold her two dairy cows and took a SACCO loan just to register me for this degree. I feel sick with guilt anytime I buy a 2,000/= Rolex, but I am terrified to let anyone here know how poor we really are. Carrying this double life every day is crushing me.',
          createdAt: Date.now() - 3600000 * 5,
          status: 'approved',
          empathyCount: 82
        },
        {
          id: 'campus-conf-103',
          username: 'Finalist in Limbo · Kyambogo',
          category: 'Missing Marks & Graduation',
          text: 'I have two missing marks from Year 2 that the department still has not resolved despite submitting my coursework 8 times. My grandmother back in the village already bought her gomesi for my graduation in January. Every time a relative congratulates me for finishing school, I swallow bile. The thought of telling them I might not be on the graduation list makes me want to disappear.',
          createdAt: Date.now() - 3600000 * 9,
          status: 'approved',
          empathyCount: 114
        }
      ];
      try { localStorage.setItem('tumaini_campus_confessions_clean_v5', 'true'); } catch (e) {}
      this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);
    }

    // Group circles start empty until created by counselors during triage
  }

  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Error saving to storage', e);
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    this.subscribers.forEach(cb => {
      try { cb(this); } catch (e) { console.error(e); }
    });
  }

  async initSupabaseSync() {
    if (supabase && supabase.isConfigured) {
      try {
        const remoteConfessions = await supabase.fetchApprovedConfessions();
        if (remoteConfessions && remoteConfessions.length > 0) {
          this.confessions = remoteConfessions;
          this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);
        }
        const remoteIntakes = await supabase.fetchActiveIntakes();
        if (remoteIntakes && remoteIntakes.length > 0) {
          const mapped = remoteIntakes.map(r => ({
            id: r.id,
            username: r.alias,
            category: r.category,
            emergencyTier: r.tier,
            isEmergency: r.tier === 'tier-1' || r.tier === 'tier-2',
            createdAt: new Date(r.created_at).getTime(),
            status: r.status,
            counselorId: r.claimed_by_id,
            counselorName: r.claimed_by_name,
            seekerToken: r.seeker_token,
            notes: r.summary || ''
          }));
          this.intakes = mapped;
          this.save(STORAGE_KEYS.INTAKES, this.intakes);
        }
        this.notify();
      } catch (e) {
        console.warn('[Tumaini Store] Supabase sync fallback:', e);
      }
    }
  }

  // --- 1. User Intake Creation ---
  createIntake({ username, category, emergencyTier }) {
    const tierMeta = EMERGENCY_TIERS[emergencyTier] || EMERGENCY_TIERS['tier-4'];
    const newIntake = {
      id: 'IN-' + Math.floor(1000 + Math.random() * 9000),
      username: (username || 'Seeker').trim(),
      category: (category || 'General Emotional Strain').trim(),
      emergencyTier: tierMeta.id,
      isEmergency: tierMeta.isEmergency,
      createdAt: Date.now(),
      status: 'waiting', // 'waiting' | 'in_session' | 'resolved'
      counselorId: null,
      counselorName: null,
      pendingGroupInvite: null, // { roomId, roomTitle, proposedBy }
      joinedRoomId: null,
      notes: ''
    };

    this.intakes = [newIntake, ...this.intakes];
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    if (supabase && supabase.isConfigured) {
      supabase.createIntake({
        id: newIntake.id,
        alias: newIntake.username,
        tier: newIntake.emergencyTier,
        category: newIntake.category,
        summary: newIntake.notes || '',
        seekerToken: newIntake.id + '_' + Date.now(),
        createdAt: newIntake.createdAt
      });
    }

    // Initial greeting in 1-on-1 stream
    this.addIntakeMessage({
      intakeId: newIntake.id,
      sender: 'system',
      senderName: 'Tumaini Care Desk',
      text: `Hello, ${newIntake.username}. Your confidential request has been queued with ${tierMeta.shortTitle} priority. A staff counselor will be with you shortly.`
    });

    if (tierMeta.isEmergency) {
      this.addIntakeMessage({
        intakeId: newIntake.id,
        sender: 'system',
        senderName: 'Emergency Safety Alert',
        text: 'If you are in immediate danger of self-harm, please contact Mental Health Uganda toll-free at 0800 21 21 21 or Butabika at 0800 211 306 immediately.'
      });
    }

    this.setActiveUserIntake(newIntake.id);
    this.notify();
    return newIntake;
  }

  setActiveUserIntake(id) {
    this.activeUserIntakeId = id;
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_INTAKE, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER_INTAKE);
    }
    this.notify();
  }

  setActiveStaffIntake(id) {
    this.activeStaffIntakeId = id;
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_STAFF_INTAKE, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_STAFF_INTAKE);
    }
    this.notify();
  }

  getActiveUserIntake() {
    return this.intakes.find(i => i.id === this.activeUserIntakeId) || null;
  }

  getActiveStaffIntake() {
    return this.intakes.find(i => i.id === this.activeStaffIntakeId) || null;
  }

  getIntake(id) {
    return this.intakes.find(i => i.id === id) || null;
  }

  // --- 2. Staff Triage Queue (Strict Emergency Sorting) ---
  getTriageQueue() {
    const active = this.intakes.filter(i => i.status !== 'resolved');
    return active.sort((a, b) => {
      const tierA = a.emergencyTier || a.tierId || 'tier-4';
      const tierB = b.emergencyTier || b.tierId || 'tier-4';
      const rankA = EMERGENCY_TIERS[tierA]?.rank ?? 99;
      const rankB = EMERGENCY_TIERS[tierB]?.rank ?? 99;

      if (rankA !== rankB) {
        return rankA - rankB; // Tier 1 > Tier 2 > Tier 3 > Tier 4
      }
      return a.createdAt - b.createdAt; // Longest wait first
    });
  }

  claimIntake(intakeId, staffSession) {
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return {
          ...i,
          status: 'in_session',
          counselorId: staffSession.staffId,
          counselorName: staffSession.name
        };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);
    this.setActiveStaffIntake(intakeId);

    if (supabase && supabase.isConfigured) {
      supabase.updateIntakeStatus(intakeId, 'active', {
        staffId: staffSession.staffId,
        name: staffSession.name,
        role: staffSession.role
      });
    }

    this.addIntakeMessage({
      intakeId,
      sender: 'system',
      senderName: 'Counselor Connected',
      text: `${staffSession.name} (${staffSession.role}) has joined this confidential consultation.`
    });

    this.notify();
  }

  updateIntakeStatus(intakeId, status) {
    this.intakes = this.intakes.map(i => i.id === intakeId ? { ...i, status } : i);
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    if (supabase && supabase.isConfigured) {
      supabase.updateIntakeStatus(intakeId, status);
    }

    this.notify();
  }

  // --- 3. 1-on-1 Messages ---
  getIntakeMessages(intakeId) {
    return this.intakeMessages[intakeId] || [];
  }

  addIntakeMessage({ intakeId, sender, senderName, text }) {
    if (!intakeId || !text.trim()) return null;

    const newMsg = {
      id: 'msg-' + Math.floor(100000 + Math.random() * 900000),
      intakeId,
      sender, // 'user' | 'counselor' | 'system'
      senderName,
      text: text.trim(),
      timestamp: Date.now()
    };

    const thread = this.intakeMessages[intakeId] ? [...this.intakeMessages[intakeId], newMsg] : [newMsg];
    this.intakeMessages = { ...this.intakeMessages, [intakeId]: thread };
    this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);

    if (supabase && supabase.isConfigured) {
      supabase.sendMessage(intakeId, {
        sender: sender === 'user' ? 'user' : (sender === 'system' ? 'system' : 'counselor'),
        authorName: senderName || 'Anonymous',
        text: text.trim()
      });
    }

    this.notify();
    return newMsg;
  }

  // --- 4. Group Room Creation & User Assignment ---
  createGroupRoom({ title, category, staffId }) {
    const newRoom = {
      id: 'grp-' + Math.floor(1000 + Math.random() * 9000),
      title: title.trim(),
      category: category.trim(),
      createdByStaffId: staffId,
      createdAt: Date.now(),
      members: []
    };

    this.groupRooms = [newRoom, ...this.groupRooms];
    this.save(STORAGE_KEYS.GROUP_ROOMS, this.groupRooms);
    this.notify();
    return newRoom;
  }

  sendGroupInvite(intakeId, { roomId, roomTitle, staffName }) {
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return {
          ...i,
          pendingGroupInvite: { roomId, roomTitle, staffName }
        };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    this.addIntakeMessage({
      intakeId,
      sender: 'system',
      senderName: 'Group Circle Invitation',
      text: `Counselor ${staffName} has invited you to join the "${roomTitle}" peer support circle.`
    });

    this.notify();
  }

  acceptGroupInvite(intakeId) {
    const intake = this.intakes.find(i => i.id === intakeId);
    if (!intake || !intake.pendingGroupInvite) return null;

    const { roomId, roomTitle } = intake.pendingGroupInvite;

    // Add user to room members
    this.groupRooms = this.groupRooms.map(r => {
      if (r.id === roomId && !r.members.includes(intake.username)) {
        return { ...r, members: [...r.members, intake.username] };
      }
      return r;
    });
    this.save(STORAGE_KEYS.GROUP_ROOMS, this.groupRooms);

    // Update intake
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return {
          ...i,
          joinedRoomId: roomId,
          pendingGroupInvite: null
        };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    this.addGroupMessage({
      roomId,
      senderName: 'Circle Welcome',
      text: `${intake.username} has entered the circle.`
    });

    this.notify();
    return roomId;
  }

  declineGroupInvite(intakeId) {
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return { ...i, pendingGroupInvite: null };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);
    this.notify();
  }

  getGroupMessages(roomId) {
    return this.groupMessages[roomId] || [];
  }

  addGroupMessage({ roomId, senderName, text }) {
    if (!roomId || !text.trim()) return null;

    const newMsg = {
      id: 'gmsg-' + Math.floor(100000 + Math.random() * 900000),
      roomId,
      senderName,
      text: text.trim(),
      timestamp: Date.now()
    };

    const thread = this.groupMessages[roomId] ? [...this.groupMessages[roomId], newMsg] : [newMsg];
    this.groupMessages = { ...this.groupMessages, [roomId]: thread };
    this.save(STORAGE_KEYS.GROUP_MESSAGES, this.groupMessages);
    this.notify();
    return newMsg;
  }

  // --- 5. Moderated Confessions Room ---
  submitConfession({ username, category, text }) {
    if (!text.trim()) return null;

    const newConfession = {
      id: 'conf-' + Math.floor(100000 + Math.random() * 900000),
      username: (username || 'Anonymous').trim(),
      category: (category || 'Personal').trim(),
      text: text.trim(),
      createdAt: Date.now(),
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      empathyCount: 0
    };

    this.confessions = [newConfession, ...this.confessions];
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);

    if (supabase && supabase.isConfigured) {
      supabase.createConfession({
        id: newConfession.id,
        username: newConfession.username,
        category: newConfession.category,
        text: newConfession.text
      });
    }

    this.notify();
    return newConfession;
  }

  getApprovedConfessions() {
    return this.confessions.filter(c => c.status === 'approved');
  }

  getPendingConfessions() {
    return this.confessions.filter(c => c.status === 'pending');
  }

  approveConfession(confessionId) {
    this.confessions = this.confessions.map(c => {
      if (c.id === confessionId) {
        return { ...c, status: 'approved' };
      }
      return c;
    });
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);

    if (supabase && supabase.isConfigured) {
      supabase.updateConfessionStatus(confessionId, 'approved');
    }

    this.notify();
  }

  rejectConfession(confessionId) {
    this.confessions = this.confessions.map(c => {
      if (c.id === confessionId) {
        return { ...c, status: 'rejected' };
      }
      return c;
    });
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);

    if (supabase && supabase.isConfigured) {
      supabase.updateConfessionStatus(confessionId, 'rejected');
    }

    this.notify();
  }

  addEmpathyToConfession(confessionId) {
    this.confessions = this.confessions.map(c => {
      if (c.id === confessionId) {
        return { ...c, empathyCount: (c.empathyCount || 0) + 1 };
      }
      return c;
    });
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);

    if (supabase && supabase.isConfigured) {
      supabase.incrementEmpathy(confessionId);
    }

    this.notify();
  }

  // --- 6. Remote Multi-Device Cloud Synchronization Handlers ---
  applyRemoteIntake(intake, initialMessages = []) {
    if (!intake || !intake.id) return;
    const existingIndex = this.intakes.findIndex(i => i.id === intake.id);
    if (existingIndex >= 0) {
      this.intakes[existingIndex] = { ...this.intakes[existingIndex], ...intake };
    } else {
      this.intakes = [intake, ...this.intakes];
    }
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
      const current = this.intakeMessages[intake.id] || [];
      const currentIds = new Set(current.map(m => m.id));
      const additions = initialMessages.filter(m => !currentIds.has(m.id));
      if (additions.length > 0) {
        this.intakeMessages = {
          ...this.intakeMessages,
          [intake.id]: [...current, ...additions]
        };
        this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);
      }
    }
    this.notify();
  }

  applyRemoteMessage(intakeId, message) {
    if (!intakeId || !message || !message.id) return;
    const current = this.intakeMessages[intakeId] || [];
    if (current.some(m => m.id === message.id)) return;
    this.intakeMessages = {
      ...this.intakeMessages,
      [intakeId]: [...current, message]
    };
    this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);
    this.notify();
  }

  applyRemoteClaim(intakeId, staffSession) {
    if (!intakeId) return;
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return {
          ...i,
          status: 'in_session',
          counselorId: staffSession?.id || 'STF-ON-DUTY',
          counselorName: staffSession?.name || 'On-Duty Counselor'
        };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);
    this.notify();
  }

  applyRemoteIntakeStatus(intakeId, status) {
    if (!intakeId) return;
    this.intakes = this.intakes.map(i => i.id === intakeId ? { ...i, status } : i);
    this.save(STORAGE_KEYS.INTAKES, this.intakes);
    this.notify();
  }

  applyRemoteGroupInvite(intakeId, inviteData) {
    if (!intakeId || !inviteData) return;
    this.intakes = this.intakes.map(i => {
      if (i.id === intakeId) {
        return {
          ...i,
          pendingGroupInvite: {
            roomId: inviteData.roomId,
            roomTitle: inviteData.roomTitle,
            staffName: inviteData.staffName
          }
        };
      }
      return i;
    });
    this.save(STORAGE_KEYS.INTAKES, this.intakes);
    this.notify();
  }

  applyRemoteGroupInviteAccepted(intakeId, roomId, username) {
    if (roomId && username) {
      this.groupRooms = this.groupRooms.map(r => {
        if (r.id === roomId && !r.members.includes(username)) {
          return { ...r, members: [...r.members, username] };
        }
        return r;
      });
      this.save(STORAGE_KEYS.GROUP_ROOMS, this.groupRooms);
    }
    if (intakeId) {
      this.intakes = this.intakes.map(i => {
        if (i.id === intakeId) {
          return { ...i, joinedRoomId: roomId, pendingGroupInvite: null };
        }
        return i;
      });
      this.save(STORAGE_KEYS.INTAKES, this.intakes);
    }
    this.notify();
  }

  applyRemoteGroupMessage(roomId, message) {
    if (!roomId || !message || !message.id) return;
    const current = this.groupMessages[roomId] || [];
    if (current.some(m => m.id === message.id)) return;
    this.groupMessages = {
      ...this.groupMessages,
      [roomId]: [...current, message]
    };
    this.save(STORAGE_KEYS.GROUP_MESSAGES, this.groupMessages);
    this.notify();
  }

  applyRemoteConfession(confession) {
    if (!confession || !confession.id) return;
    if (this.confessions.some(c => c.id === confession.id)) return;
    this.confessions = [confession, ...this.confessions];
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);
    this.notify();
  }

  applyRemoteConfessionStatus(confessionId, status) {
    if (!confessionId) return;
    this.confessions = this.confessions.map(c => c.id === confessionId ? { ...c, status } : c);
    this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);
    this.notify();
  }

  // --- 7. Data Retention & Auto-Purge Lifecycle (Data Minimization) ---
  purgeOldSessions() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const initialCount = this.intakes.length;
    this.intakes = this.intakes.filter(i => {
      // Purge resolved cases older than 2 hours or any cases older than 24 hours
      if (i.status === 'resolved' && (now - i.createdAt > 2 * 3600000)) return false;
      if (now - i.createdAt > ONE_DAY_MS) return false;
      return true;
    });

    if (this.intakes.length !== initialCount) {
      const remainingIds = new Set(this.intakes.map(i => i.id));
      this.save(STORAGE_KEYS.INTAKES, this.intakes);

      const cleanedMessages = {};
      for (const id in this.intakeMessages) {
        if (remainingIds.has(id)) {
          cleanedMessages[id] = this.intakeMessages[id];
        }
      }
      this.intakeMessages = cleanedMessages;
      this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);
    }
  }

  purgeIntake(intakeId) {
    if (!intakeId) return;
    this.intakes = this.intakes.filter(i => i.id !== intakeId);
    this.save(STORAGE_KEYS.INTAKES, this.intakes);

    if (this.intakeMessages[intakeId]) {
      delete this.intakeMessages[intakeId];
      this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);
    }

    if (this.activeUserIntakeId === intakeId) {
      this.setActiveUserIntake(null);
    }
    if (this.activeStaffIntakeId === intakeId) {
      this.setActiveStaffIntake(null);
    }
    this.notify();
  }
}

export const store = new TumainiStore();
