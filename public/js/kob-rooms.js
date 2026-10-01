/* ==========================================================================
   KOB - ROOMS REPOSITORY & REAL-TIME BUS
   - Pre-configured safe spaces + user-created custom catalogs
   - Ephemeral room message bus (BroadcastChannel + storage)
   - Zero hardcoded demo messages
   ========================================================================== */

export const PRESET_ROOMS = [
  {
    id: 'anxiety-stress',
    title: 'Anxiety & Stress',
    desc: 'Job hunts, tuition deadlines, rent pressure, and quiet worry.',
    tag: 'Stress',
    isCustom: false
  },
  {
    id: 'grief-loss',
    title: 'Grief & Loss',
    desc: 'Bereavement, miscarriage, and processing the absence of loved ones.',
    tag: 'Grief',
    isCustom: false
  },
  {
    id: 'relationships',
    title: 'Relationships & Family',
    desc: 'Heartbreak, overbearing family demands, and silent burdens.',
    tag: 'Family',
    isCustom: false
  },
  {
    id: 'vent',
    title: 'Just Need To Vent',
    desc: 'Speak raw truth without anyone telling you to just pray harder or guma.',
    tag: 'Venting',
    isCustom: false
  },
  {
    id: 'late-night',
    title: "Late Night / Can't Sleep",
    desc: 'A quiet, unhurried space for night owls fighting insomnia between 11 PM and 4 AM.',
    tag: 'Night',
    isCustom: false
  }
];

const STORAGE_KEYS = {
  CUSTOM_ROOMS: 'kob_custom_rooms_v1',
  MESSAGES: 'kob_room_messages_v1',
  ACTIVE_ROOM: 'kob_active_room_v1'
};

class RoomStore {
  constructor() {
    this.customRooms = this.loadCustomRooms();
    this.messages = this.loadMessages();
    this.subscribers = new Set();
    this.channel = null;

    this.initChannel();
    this.initStorageListener();
  }

  initChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('kob_sync_channel');
        this.channel.onmessage = (e) => {
          if (e.data && e.data.type === 'NEW_MESSAGE') {
            this.messages = this.loadMessages();
            this.notify();
          } else if (e.data && e.data.type === 'NEW_ROOM') {
            this.customRooms = this.loadCustomRooms();
            this.notify();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel fallback', err);
      }
    }
  }

  initStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.MESSAGES) {
        this.messages = this.loadMessages();
        this.notify();
      } else if (e.key === STORAGE_KEYS.CUSTOM_ROOMS) {
        this.customRooms = this.loadCustomRooms();
        this.notify();
      }
    });
  }

  loadCustomRooms() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_ROOMS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveCustomRooms() {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_ROOMS, JSON.stringify(this.customRooms));
    } catch (e) {
      console.warn('Error saving custom rooms', e);
    }
    this.notify();
  }

  loadMessages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  saveMessages() {
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages));
    } catch (e) {
      console.warn('Error saving messages', e);
    }
    this.notify();
  }

  getAllRooms() {
    return [...PRESET_ROOMS, ...this.customRooms];
  }

  getRoom(roomId) {
    return this.getAllRooms().find(r => r.id === roomId) || null;
  }

  createCustomRoom(title, desc) {
    const slug = 'room-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.floor(100 + Math.random() * 900);
    const newRoom = {
      id: slug,
      title: title.trim(),
      desc: desc ? desc.trim() : 'Community created peer circle.',
      tag: 'Community',
      isCustom: true,
      createdAt: Date.now()
    };

    this.customRooms.unshift(newRoom);
    this.saveCustomRooms();

    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_ROOM', room: newRoom });
    }

    return newRoom;
  }

  getMessages(roomId) {
    return this.messages[roomId] || [];
  }

  addMessage(roomId, { senderName, text, isMine = false }) {
    if (!roomId || !text.trim()) return null;

    const newMsg = {
      id: 'msg-' + Math.floor(100000 + Math.random() * 900000),
      roomId,
      senderName,
      text: text.trim(),
      timestamp: Date.now()
    };

    if (!this.messages[roomId]) {
      this.messages[roomId] = [];
    }
    this.messages[roomId].push(newMsg);
    this.saveMessages();

    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_MESSAGE', msg: newMsg });
    }

    return newMsg;
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
}

export const roomStore = new RoomStore();
