/* ==========================================================================
   TUMAINI - REAL-TIME CLOUD SYNC & SYNTHESIZED AUDIO BUS
   - Multi-device real-time cloud synchronization (HTTPS SSE & HTTP POST)
   - Cross-tab synchronization via BroadcastChannel & storage events
   - Polling hydration for recent cases on connect / reconnect
   - Web Audio API dual-harmonic chime synthesis
   ========================================================================== */

import { store } from './store.js';

class TumainiBus {
  constructor() {
    this.channelName = 'tumaini_sync_bus_clean';
    this.cloudRelayUrl = 'https://ntfy.sh/tumaini_uganda_sanctuary_sync_v1';
    
    // Unique device ID for this browser session to avoid self-echoing
    let devId = null;
    try {
      devId = sessionStorage.getItem('tumaini_device_session_id');
      if (!devId) {
        devId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        sessionStorage.setItem('tumaini_device_session_id', devId);
      }
    } catch (e) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    }
    this.deviceId = devId;

    this.channel = null;
    this.eventSource = null;
    this.audioCtx = null;
    this.processedCloudIds = new Set();
    this.isCloudConnected = false;

    this.initChannel();
    this.initStorageListener();
    this.initCloudRelay();
  }

  initChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (e) => this.handleLocalMessage(e.data);
      } catch (err) {
        console.warn('BroadcastChannel fallback', err);
      }
    }
  }

  initStorageListener() {
    window.addEventListener('storage', (e) => {
      if (
        e.key.startsWith('tumaini_intakes') ||
        e.key.startsWith('tumaini_intake_messages') ||
        e.key.startsWith('tumaini_group') ||
        e.key.startsWith('tumaini_confessions')
      ) {
        store.intakes = store.load('tumaini_intakes_clean_v1', []);
        store.intakeMessages = store.load('tumaini_intake_messages_clean_v1', {});
        store.groupRooms = store.load('tumaini_group_rooms_clean_v1', []);
        store.groupMessages = store.load('tumaini_group_messages_clean_v1', {});
        store.confessions = store.load('tumaini_confessions_clean_v1', []);
        store.notify();
      }
    });

    // Re-sync recent cloud events whenever window gains focus
    window.addEventListener('focus', () => {
      this.syncRecentCloudEvents();
    });
  }

  initCloudRelay() {
    if (typeof window === 'undefined') return;

    // 1. Initial hydration: fetch recent messages from cloud cache
    this.syncRecentCloudEvents();

    // 2. Real-time stream via Server-Sent Events (SSE)
    if ('EventSource' in window) {
      try {
        this.eventSource = new EventSource(`${this.cloudRelayUrl}/sse`);
        
        this.eventSource.onopen = () => {
          this.isCloudConnected = true;
          this.updateCloudSyncBadge(true);
        };

        this.eventSource.onmessage = (e) => {
          try {
            const raw = JSON.parse(e.data);
            if (raw && raw.id && this.processedCloudIds.has(raw.id)) return;
            if (raw && raw.id) this.processedCloudIds.add(raw.id);

            // ntfy wraps the payload in raw.message
            if (raw && raw.message) {
              const envelope = typeof raw.message === 'string' ? JSON.parse(raw.message) : raw.message;
              this.handleIncomingEnvelope(envelope, false);
            }
          } catch (err) {
            // Ignore keepalive / non-JSON ping frames
          }
        };

        this.eventSource.onerror = () => {
          this.isCloudConnected = false;
          this.updateCloudSyncBadge(false);
          // SSE automatically attempts reconnection in standard browsers
        };
      } catch (err) {
        console.warn('EventSource initialization error', err);
      }
    }
  }

  async syncRecentCloudEvents() {
    try {
      const res = await fetch(`${this.cloudRelayUrl}/json?poll=1`);
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;

      const lines = text.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line.trim());
          if (raw && raw.id && this.processedCloudIds.has(raw.id)) continue;
          if (raw && raw.id) this.processedCloudIds.add(raw.id);

          if (raw && raw.message) {
            const envelope = typeof raw.message === 'string' ? JSON.parse(raw.message) : raw.message;
            this.handleIncomingEnvelope(envelope, false);
          }
        } catch (e) {}
      }
      this.updateCloudSyncBadge(true);
    } catch (err) {
      // Offline fallback
    }
  }

  updateCloudSyncBadge(isConnected) {
    const badge = document.getElementById('cloudSyncStatusBadge');
    if (badge) {
      if (isConnected) {
        badge.style.display = 'inline-flex';
        badge.innerHTML = '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; margin-right: 5px;"></span> LIVE CLOUD SYNC';
        badge.style.color = '#10b981';
      } else {
        badge.innerHTML = '<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; margin-right: 5px;"></span> RECONNECTING...';
        badge.style.color = '#f59e0b';
      }
    }
  }

  broadcast(type, payload = {}) {
    const envelope = {
      type,
      payload,
      deviceId: this.deviceId,
      timestamp: Date.now()
    };

    // 1. Broadcast locally to other tabs on the same device
    if (this.channel) {
      try {
        this.channel.postMessage(envelope);
      } catch (e) {
        console.warn('Local broadcast error', e);
      }
    }

    // 2. Broadcast over the internet to other physical devices (phone <-> PC)
    try {
      fetch(this.cloudRelayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      }).catch(() => {});
    } catch (e) {}
  }

  handleLocalMessage(envelope) {
    if (!envelope || !envelope.type) return;
    this.handleIncomingEnvelope(envelope, true);
  }

  handleIncomingEnvelope(envelope, isLocalTab = false) {
    if (!envelope || !envelope.type) return;

    // Ignore broadcasts that originated from this exact device/tab
    if (!isLocalTab && envelope.deviceId === this.deviceId) {
      return;
    }

    const { type, payload } = envelope;

    if (type === 'NEW_INTAKE') {
      if (payload && payload.intake) {
        store.applyRemoteIntake(payload.intake, payload.initialMessages);
        this.playChime(payload.intake.isEmergency ? 'urgent' : 'subtle');
      } else {
        store.intakes = store.load('tumaini_intakes_clean_v1', []);
        store.notify();
      }
    } else if (type === 'MESSAGE_SENT') {
      if (payload && payload.intakeId && payload.message) {
        store.applyRemoteMessage(payload.intakeId, payload.message);
        this.playChime('subtle');
      } else {
        store.intakeMessages = store.load('tumaini_intake_messages_clean_v1', {});
        store.notify();
      }
    } else if (type === 'INTAKE_CLAIMED') {
      if (payload && payload.intakeId) {
        store.applyRemoteClaim(payload.intakeId, payload.staffSession);
      }
    } else if (type === 'INTAKE_STATUS' || type === 'CASE_RESOLVED') {
      if (payload && (payload.intakeId || payload.caseId)) {
        const id = payload.intakeId || payload.caseId;
        const status = payload.status || 'resolved';
        store.applyRemoteIntakeStatus(id, status);
      }
    } else if (type === 'GROUP_INVITE_SENT') {
      if (payload && payload.intakeId) {
        store.applyRemoteGroupInvite(payload.intakeId, payload);
      }
    } else if (type === 'GROUP_INVITE_ACCEPTED') {
      if (payload) {
        store.applyRemoteGroupInviteAccepted(payload.intakeId, payload.roomId, payload.username);
      }
    } else if (type === 'GROUP_MESSAGE') {
      if (payload && payload.roomId && payload.message) {
        store.applyRemoteGroupMessage(payload.roomId, payload.message);
        this.playChime('subtle');
      }
    } else if (type === 'NEW_CONFESSION') {
      if (payload && payload.confession) {
        store.applyRemoteConfession(payload.confession);
      }
    } else if (type === 'CONFESSION_STATUS') {
      if (payload && payload.confessionId && payload.status) {
        store.applyRemoteConfessionStatus(payload.confessionId, payload.status);
      }
    }
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playChime(type = 'subtle') {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'urgent') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now); // E5
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {}
  }
}

export const bus = new TumainiBus();
