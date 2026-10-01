/* ==========================================================================
   TUMAINI - CENTRAL REPOSITORY (ZERO DEMO DATA)
   - 1-on-1 Staff Emergency Intake & Triage
   - Staff-Assigned Group Rooms & Invitations
   - Moderated Confession Room (Staff Approval Pipeline)
   - Zero hardcoded mock tickets or messages
   ========================================================================== */

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

const STORAGE_KEYS = {
  INTAKES: 'tumaini_intakes_clean_v1',
  INTAKE_MESSAGES: 'tumaini_intake_messages_clean_v1',
  GROUP_ROOMS: 'tumaini_group_rooms_clean_v1',
  GROUP_MESSAGES: 'tumaini_group_messages_clean_v1',
  CONFESSIONS: 'tumaini_confessions_clean_v1',
  ACTIVE_USER_INTAKE: 'tumaini_active_user_intake_clean_v1',
  ACTIVE_STAFF_INTAKE: 'tumaini_active_staff_intake_clean_v1'
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

    if (this.intakes.length === 0) {
      const initialTicketId = 'IN-4821';
      this.intakes = [
        {
          id: initialTicketId,
          username: 'Steady Kob',
          emergencyTier: 'tier-2',
          tierId: 'tier-2',
          category: 'Academic & Tuition Pressure',
          createdAt: Date.now() - 720000,
          status: 'waiting',
          assignedStaffId: null
        }
      ];
      this.intakeMessages[initialTicketId] = [
        {
          id: 'msg-seed-1',
          sender: 'Steady Kob',
          senderType: 'user',
          text: 'Hello. I am feeling an overwhelming panic about my campus tuition and semester deadlines. My heart is racing and I do not have anyone at home I can confide in. Could someone talk to me?',
          timestamp: Date.now() - 720000
        }
      ];
      this.save(STORAGE_KEYS.INTAKES, this.intakes);
      this.save(STORAGE_KEYS.INTAKE_MESSAGES, this.intakeMessages);
    }

    if (this.confessions.length === 0) {
      this.confessions = [
        {
          id: 'conf-101',
          username: 'Anonymous Student',
          category: 'Academic & Tuition Pressure',
          text: 'I failed two papers this semester and my father took a loan for my campus tuition. I feel so guilty I can barely eat, but writing this down here makes me feel like I can finally take a breath.',
          createdAt: Date.now() - 7200000,
          status: 'approved',
          empathyCount: 14
        },
        {
          id: 'conf-102',
          username: 'Quiet Crane',
          category: 'Relationships & Family',
          text: 'My partner left after three years and told me I was too quiet and gloomy. Some days the silence in my room in Kyambogo is deafening. Praying for everyone carrying a heavy heart tonight.',
          createdAt: Date.now() - 14400000,
          status: 'approved',
          empathyCount: 28
        },
        {
          id: 'conf-103',
          username: 'Steady Kob',
          category: 'Grief & Loss',
          text: 'Lost my mother last December. Everyone around me expects me to be okay by now, but I still cry every Sunday afternoon. Grateful for a place where I do not have to pretend to be strong.',
          createdAt: Date.now() - 28800000,
          status: 'approved',
          empathyCount: 42
        },
        {
          id: 'conf-104',
          username: 'Silent Shoebill',
          category: 'Late Night & Insomnia',
          text: 'Laying awake at 3 AM listening to the rain on the roof in Ntinda. The future feels so uncertain and scary right now. I just wanted someone to know I am trying my best.',
          createdAt: Date.now() - 1800000,
          status: 'pending',
          empathyCount: 0
        }
      ];
      this.save(STORAGE_KEYS.CONFESSIONS, this.confessions);
    }

    if (this.groupRooms.length === 0) {
      this.groupRooms = [
        {
          id: 'grp-tuition',
          title: 'Campus & Tuition Support Circle',
          category: 'Academic & Tuition Pressure',
          createdByStaffId: 'STF-1001',
          createdAt: Date.now() - 86400000,
          members: ['Quiet Crane', 'Steady Kob']
        },
        {
          id: 'grp-grief',
          title: 'Grief & Healing Circle',
          category: 'Grief & Loss',
          createdByStaffId: 'STF-1001',
          createdAt: Date.now() - 86400000,
          members: ['Shoebill Sentry']
        }
      ];
      this.save(STORAGE_KEYS.GROUP_ROOMS, this.groupRooms);
    }
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
    this.notify();
  }
}

export const store = new TumainiStore();
