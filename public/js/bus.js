/* ==========================================================================
   TUMAINI - EVENT BUS & SYNTHESIZED AUDIO
   - Cross-tab synchronization via BroadcastChannel & storage events
   - Web Audio API dual-harmonic chime synthesis
   ========================================================================== */

import { store } from './store.js';

class TumainiBus {
  constructor() {
    this.channelName = 'tumaini_sync_bus_clean';
    this.channel = null;
    this.audioCtx = null;

    this.initChannel();
    this.initStorageListener();
  }

  initChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (e) => this.handleMessage(e.data);
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
  }

  broadcast(type, payload = {}) {
    const data = { type, payload, timestamp: Date.now() };
    if (this.channel) {
      try {
        this.channel.postMessage(data);
      } catch (e) {
        console.warn('Broadcast error', e);
      }
    }
  }

  handleMessage(data) {
    if (!data || !data.type) return;

    store.intakes = store.load('tumaini_intakes_clean_v1', []);
    store.intakeMessages = store.load('tumaini_intake_messages_clean_v1', {});
    store.groupRooms = store.load('tumaini_group_rooms_clean_v1', []);
    store.groupMessages = store.load('tumaini_group_messages_clean_v1', {});
    store.confessions = store.load('tumaini_confessions_clean_v1', []);
    store.notify();

    if (data.type === 'NEW_INTAKE') {
      this.playChime(data.payload?.isEmergency ? 'urgent' : 'subtle');
    } else if (data.type === 'MESSAGE_SENT') {
      this.playChime('subtle');
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
