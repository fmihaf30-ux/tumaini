/* ==========================================================================
   HAVEN SANCTUARY - REAL-TIME SYNC & SOUND ENGINE
   - BroadcastChannel multi-tab and split-screen instant synchronization
   - Web Audio API pure synthesis (calming chimes, no external sound files)
   - Empathetic counselor auto-response fallback (user is never left stranded)
   ========================================================================== */

import { state, EMERGENCY_TIERS, CATEGORIES } from './state.js';

class RealtimeSyncManager {
  constructor() {
    this.channelName = 'haven_sanctuary_sync_channel';
    this.channel = null;
    this.audioCtx = null;
    this.soundEnabled = true;

    this.initChannel();
    this.initStorageFallback();
    this.initSimulatedCounselorBot();
  }

  initChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          this.handleIncomingSync(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel initialization error', e);
      }
    }
  }

  initStorageFallback() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'haven_cases_v2' || e.key === 'haven_messages_v2') {
        state.cases = state.loadCases();
        state.messages = state.loadMessages();
        state.notify();
      }
    });
  }

  broadcast(type, payload) {
    const data = { type, payload, timestamp: Date.now() };
    if (this.channel) {
      try {
        this.channel.postMessage(data);
      } catch (e) {
        console.warn('Broadcast error', e);
      }
    }
  }

  handleIncomingSync(data) {
    if (!data || !data.type) return;

    // Refresh state from storage
    state.cases = state.loadCases();
    state.messages = state.loadMessages();
    state.notify();

    if (data.type === 'NEW_CASE' && data.payload?.isEmergency) {
      this.playChime('urgent');
    } else if (data.type === 'NEW_MESSAGE') {
      this.playChime('soft');
    }
  }

  // --- Web Audio API Synthesis ---
  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playChime(type = 'soft') {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const now = this.audioCtx.currentTime;

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'urgent') {
        // Double alerting chime for Tier 1 / Tier 2 emergency intake
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // Soothing warm harmonic chime (F#5) for message delivery
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(739.99, now); // F#5
        osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.25); // C#5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  }

  // --- Empathetic Automated Counselor Fallback ---
  // Guarantees vulnerable users testing the app are never met with silence
  initSimulatedCounselorBot() {
    // Check if the user is in an active chat and sent a message without response
    setInterval(() => {
      const activeUserCase = state.getActiveUserCase();
      if (!activeUserCase || activeUserCase.status === 'resolved') return;

      const messages = state.getMessagesForCase(activeUserCase.id);
      if (messages.length === 0) return;

      const lastMsg = messages[messages.length - 1];
      // If last message was from user and older than 3.5 seconds
      if (lastMsg.sender === 'user' && (Date.now() - lastMsg.timestamp) > 3500) {
        this.generateEmpatheticResponse(activeUserCase, lastMsg.text);
      }
    }, 2000);
  }

  generateEmpatheticResponse(userCase, userText) {
    const tierMeta = EMERGENCY_TIERS[userCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    const counselorName = userCase.counselorName || 'Counselor Sarah (On Duty)';

    let reply = '';
    const lower = userText.toLowerCase();

    if (tierMeta.rank === 1) {
      // Critical crisis response
      if (lower.includes('hurt') || lower.includes('die') || lower.includes('end it')) {
        reply = `I hear how intense the pain is right now, ${userCase.pseudonym}, and I want you to know you are not alone. Please keep talking with me. If you feel you cannot stay safe this very second, please call 988 or text HOME to 741741. We can stay together here right now.`;
      } else {
        reply = `Thank you for telling me, ${userCase.pseudonym}. You did something brave by sharing that. You are in a safe container here. Can we take one slow breath together before we take the next step?`;
      }
    } else if (tierMeta.rank === 2) {
      // Acute panic response
      reply = `I hear you, ${userCase.pseudonym}. When panic hits, it can feel like your entire body is spinning. Let's ground right now: feel your feet on the floor. Take a gentle breath in through your nose for 4 seconds... and let it out. I'm right here with you.`;
    } else if (tierMeta.rank === 3) {
      // Overwhelmed response
      reply = `It sounds like you have been carrying far too much for too long, ${userCase.pseudonym}. You don't have to fix everything in this moment. What is feeling the heaviest for you today?`;
    } else {
      // Standard supportive listening response
      reply = `I appreciate you opening up, ${userCase.pseudonym}. I'm here and listening with zero judgment. Take all the space and time you need to write whatever is on your mind.`;
    }

    // Assign counselor and post response
    state.updateCaseStatus(userCase.id, 'in_session', counselorName);
    state.addMessage({
      caseId: userCase.id,
      sender: 'counselor',
      senderName: counselorName,
      text: reply
    });

    this.broadcast('NEW_MESSAGE', { caseId: userCase.id });
    this.playChime('soft');
  }
}

export const sync = new RealtimeSyncManager();
