/* ==========================================================================
   HAVEN CORE - USER TERMINAL CONTROLLER
   - Public Emotional Support Sanctuary
   - Anonymous pseudonym intake with emergency severity selection
   - Real-time confidential chat with on-duty counselors
   - Interactive 4-4-4-4 Box Breathing & Grounding tools
   - Instant Safety Quick Exit (Esc)
   ========================================================================== */

import { store, EMERGENCY_TIERS, CATEGORIES } from './store.js';
import { bus } from './bus.js';

const CALM_PSEUDONYMS = [
  'GentleBrook', 'QuietPine', 'SilverLake', 'CalmHorizon',
  'AmberDawn', 'RestfulMeadow', 'StillWater', 'WhisperingFern',
  'CedarBreeze', 'OceanMist', 'PeacefulCloud', 'GoldenLeaf'
];

class UserTerminal {
  constructor() {
    this.currentCase = null;
    this.breathingInterval = null;
    this.breathingPhase = 0; // 0: Inhale, 1: Hold, 2: Exhale, 3: Hold
    this.breathingCounter = 4;
    this.isBreathingActive = false;

    this.initElements();
    this.bindEvents();
    this.checkExistingSession();
    this.initSubscriptions();
  }

  initElements() {
    // Containers
    this.intakeScreen = document.getElementById('userIntakeScreen');
    this.sessionScreen = document.getElementById('userSessionScreen');
    
    // Intake Form
    this.intakeForm = document.getElementById('userIntakeForm');
    this.pseudonymInput = document.getElementById('userPseudonymInput');
    this.randomPseudonymBtn = document.getElementById('btnRandomPseudonym');
    
    // Session Elements
    this.sessionSeekerName = document.getElementById('sessionSeekerName');
    this.sessionTierBadge = document.getElementById('sessionTierBadge');
    this.sessionCategoryText = document.getElementById('sessionCategoryText');
    this.sessionEmergencyBanner = document.getElementById('sessionEmergencyBanner');
    this.chatMessageList = document.getElementById('chatMessageList');
    this.chatInput = document.getElementById('chatTextInput');
    this.btnSend = document.getElementById('btnSendMessage');
    this.quickPromptsWrap = document.getElementById('quickPromptsWrap');
    this.btnEndSession = document.getElementById('btnEndSession');
    
    // Grounding Drawer
    this.btnToggleGrounding = document.getElementById('btnToggleGrounding');
    this.groundingDrawer = document.getElementById('userGroundingDrawer');
    this.btnCloseGrounding = document.getElementById('btnCloseGrounding');
    this.btnStartBreathing = document.getElementById('btnStartBreathing');
    this.phaseText = document.getElementById('breathingPhaseText');
    this.countdownText = document.getElementById('breathingCountdownText');
    this.breathingCircle = document.getElementById('breathingAnimatedCircle');
    
    // Emergency Modal
    this.hotlinesModal = document.getElementById('hotlinesModal');
    this.btnOpenHotlines = document.getElementById('btnOpenHotlines');
    this.btnCloseHotlines = document.getElementById('btnCloseHotlines');
    this.btnQuickExit = document.getElementById('btnQuickExit');
  }

  bindEvents() {
    // Pseudonym randomizer
    if (this.randomPseudonymBtn && this.pseudonymInput) {
      this.randomPseudonymBtn.addEventListener('click', () => {
        const choice = CALM_PSEUDONYMS[Math.floor(Math.random() * CALM_PSEUDONYMS.length)];
        const num = Math.floor(10 + Math.random() * 89);
        this.pseudonymInput.value = `${choice}${num}`;
      });
    }

    // Intake submission
    if (this.intakeForm) {
      this.intakeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleIntakeSubmit();
      });
    }

    // Chat sending
    if (this.btnSend && this.chatInput) {
      this.btnSend.addEventListener('click', () => this.handleSendMessage());
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Quick prompts
    if (this.quickPromptsWrap) {
      this.quickPromptsWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.prompt-chip');
        if (chip && this.chatInput) {
          this.chatInput.value = chip.dataset.prompt || chip.textContent.trim();
          this.chatInput.focus();
        }
      });
    }

    // Grounding drawer toggle
    if (this.btnToggleGrounding && this.groundingDrawer) {
      this.btnToggleGrounding.addEventListener('click', () => {
        this.groundingDrawer.classList.toggle('is-hidden');
      });
    }
    if (this.btnCloseGrounding && this.groundingDrawer) {
      this.btnCloseGrounding.addEventListener('click', () => {
        this.groundingDrawer.classList.add('is-hidden');
      });
    }

    // Box breathing start/stop
    if (this.btnStartBreathing) {
      this.btnStartBreathing.addEventListener('click', () => {
        this.toggleBreathing();
      });
    }

    // End session
    if (this.btnEndSession) {
      this.btnEndSession.addEventListener('click', () => {
        if (confirm('Are you sure you want to end this confidential session?')) {
          this.endSession();
        }
      });
    }

    // Hotlines Modal
    if (this.btnOpenHotlines && this.hotlinesModal) {
      this.btnOpenHotlines.addEventListener('click', () => {
        this.hotlinesModal.classList.add('active');
      });
    }
    if (this.btnCloseHotlines && this.hotlinesModal) {
      this.btnCloseHotlines.addEventListener('click', () => {
        this.hotlinesModal.classList.remove('active');
      });
    }
    if (this.hotlinesModal) {
      this.hotlinesModal.addEventListener('click', (e) => {
        if (e.target === this.hotlinesModal) {
          this.hotlinesModal.classList.remove('active');
        }
      });
    }

    // Quick Safety Exit (Navigates away immediately)
    if (this.btnQuickExit) {
      this.btnQuickExit.addEventListener('click', () => this.quickExit());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Double check if modal is open first
        if (this.hotlinesModal && this.hotlinesModal.classList.contains('active')) {
          this.hotlinesModal.classList.remove('active');
        } else {
          this.quickExit();
        }
      }
    });
  }

  initSubscriptions() {
    store.subscribe(() => {
      if (this.currentCase) {
        const updated = store.cases.find(c => c.id === this.currentCase.id);
        if (updated) {
          this.currentCase = updated;
          this.renderMessages();
          this.updateSessionHeader();
        }
      }
    });
  }

  checkExistingSession() {
    const activeCase = store.getActiveUserCase();
    if (activeCase && activeCase.status !== 'resolved') {
      this.currentCase = activeCase;
      this.showSessionView();
    } else {
      this.showIntakeView();
      // Pre-seed a friendly pseudonym if blank
      if (this.pseudonymInput && !this.pseudonymInput.value) {
        const choice = CALM_PSEUDONYMS[Math.floor(Math.random() * CALM_PSEUDONYMS.length)];
        const num = Math.floor(10 + Math.random() * 89);
        this.pseudonymInput.value = `${choice}${num}`;
      }
    }
  }

  showIntakeView() {
    if (this.intakeScreen) this.intakeScreen.style.display = 'block';
    if (this.sessionScreen) this.sessionScreen.classList.remove('active');
  }

  showSessionView() {
    if (this.intakeScreen) this.intakeScreen.style.display = 'none';
    if (this.sessionScreen) this.sessionScreen.classList.add('active');
    this.updateSessionHeader();
    this.renderMessages();
  }

  handleIntakeSubmit() {
    const pseudonym = this.pseudonymInput ? this.pseudonymInput.value.trim() : '';
    const categoryEl = document.querySelector('input[name="category"]:checked');
    const tierEl = document.querySelector('input[name="emergencyTier"]:checked');

    const category = categoryEl ? categoryEl.value : 'anxiety';
    const emergencyTier = tierEl ? tierEl.value : 'tier-4';

    const newCase = store.createCase({
      pseudonym: pseudonym || 'SafeSeeker',
      category,
      emergencyTier
    });

    this.currentCase = newCase;
    bus.broadcast('CASE_CREATED', newCase);

    this.showSessionView();
  }

  updateSessionHeader() {
    if (!this.currentCase) return;

    if (this.sessionSeekerName) {
      this.sessionSeekerName.textContent = this.currentCase.pseudonym;
    }

    const tierMeta = EMERGENCY_TIERS[this.currentCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    if (this.sessionTierBadge) {
      this.sessionTierBadge.textContent = tierMeta.tag;
      this.sessionTierBadge.className = `badge ${tierMeta.badgeClass}`;
    }

    const catMeta = CATEGORIES[this.currentCase.category];
    if (this.sessionCategoryText) {
      const counselorTxt = this.currentCase.counselorName
        ? `• Assigned Counselor: ${this.currentCase.counselorName}`
        : '• Counselor assigning...';
      this.sessionCategoryText.textContent = `${catMeta ? catMeta.label : 'General Support'} ${counselorTxt}`;
    }

    if (this.sessionEmergencyBanner) {
      if (tierMeta.isEmergency) {
        this.sessionEmergencyBanner.style.display = 'flex';
      } else {
        this.sessionEmergencyBanner.style.display = 'none';
      }
    }
  }

  renderMessages() {
    if (!this.currentCase || !this.chatMessageList) return;

    const messages = store.getMessagesForCase(this.currentCase.id);
    this.chatMessageList.innerHTML = '';

    messages.forEach(msg => {
      const isSystem = msg.sender === 'system';
      const isUser = msg.sender === 'user';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isSystem) {
        const div = document.createElement('div');
        div.className = 'system-message-row';
        div.textContent = msg.text;
        this.chatMessageList.appendChild(div);
      } else {
        const row = document.createElement('div');
        row.className = `chat-bubble-row ${isUser ? 'is-user' : 'is-counselor'}`;

        const senderLabel = isUser ? 'You (Confidential)' : (msg.senderName || 'Haven Counselor');

        row.innerHTML = `
          <span class="bubble-sender-name">${senderLabel}</span>
          <div class="bubble-content">${this.escapeHtml(msg.text)}</div>
          <span class="bubble-timestamp">${timeStr}</span>
        `;
        this.chatMessageList.appendChild(row);
      }
    });

    // Auto-scroll to bottom
    this.chatMessageList.scrollTop = this.chatMessageList.scrollHeight;
  }

  handleSendMessage() {
    if (!this.currentCase || !this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    store.addMessage({
      caseId: this.currentCase.id,
      sender: 'user',
      senderName: this.currentCase.pseudonym,
      text
    });

    bus.broadcast('MESSAGE_SENT', { caseId: this.currentCase.id, sender: 'user' });
    this.chatInput.value = '';
    this.renderMessages();
  }

  endSession() {
    if (this.currentCase) {
      store.updateCaseStatus(this.currentCase.id, 'resolved');
      bus.broadcast('CASE_RESOLVED', { caseId: this.currentCase.id });
    }
    store.setActiveUserCase(null);
    this.currentCase = null;
    this.stopBreathing();
    this.showIntakeView();
  }

  quickExit() {
    // Instantly replace URL with Google Weather and clear session
    window.location.replace('https://www.google.com/search?q=weather');
  }

  // --- Box Breathing Logic (4-4-4-4) ---
  toggleBreathing() {
    if (this.isBreathingActive) {
      this.stopBreathing();
    } else {
      this.startBreathing();
    }
  }

  startBreathing() {
    this.isBreathingActive = true;
    if (this.btnStartBreathing) {
      this.btnStartBreathing.textContent = 'Pause Breathing Guide';
      this.btnStartBreathing.style.background = '#64748b';
    }

    const phases = [
      { text: 'Inhale slowly...', circleScale: 1.35, duration: 4 },
      { text: 'Hold gently...', circleScale: 1.35, duration: 4 },
      { text: 'Exhale smoothly...', circleScale: 0.85, duration: 4 },
      { text: 'Rest & Hold...', circleScale: 0.85, duration: 4 }
    ];

    this.breathingPhase = 0;
    this.breathingCounter = 4;
    this.updateBreathingDisplay(phases[0].text, this.breathingCounter, phases[0].circleScale);

    clearInterval(this.breathingInterval);
    this.breathingInterval = setInterval(() => {
      this.breathingCounter--;
      if (this.breathingCounter <= 0) {
        this.breathingPhase = (this.breathingPhase + 1) % 4;
        this.breathingCounter = 4;
      }
      const cur = phases[this.breathingPhase];
      this.updateBreathingDisplay(cur.text, this.breathingCounter, cur.circleScale);
    }, 1000);
  }

  stopBreathing() {
    this.isBreathingActive = false;
    clearInterval(this.breathingInterval);
    if (this.btnStartBreathing) {
      this.btnStartBreathing.textContent = 'Start 4-4-4-4 Breathing';
      this.btnStartBreathing.style.background = '#10b981';
    }
    this.updateBreathingDisplay('Ready when you are', 4, 1.0);
  }

  updateBreathingDisplay(text, count, scale) {
    if (this.phaseText) this.phaseText.textContent = text;
    if (this.countdownText) this.countdownText.textContent = `${count}s`;
    if (this.breathingCircle) {
      this.breathingCircle.style.transform = `scale(${scale})`;
      this.breathingCircle.style.transition = 'transform 3.8s ease-in-out';
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  new UserTerminal();
});
