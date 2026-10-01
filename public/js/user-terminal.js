/* ==========================================================================
   HAVEN SANCTUARY - USER TERMINAL CONTROLLER
   - Anonymous intake with pseudonym generation
   - Emergency severity tier selection
   - Live chat session, quick prompt pills, and grounding drawer integration
   ========================================================================== */

import { state, EMERGENCY_TIERS, CATEGORIES } from './state.js';
import { sync } from './sync.js';
import { GroundingController } from './grounding.js';

const PSEUDONYMS = [
  'GentleRiver', 'CalmDrifter', 'QuietPine', 'SilverLeaf', 'WarmHarbor',
  'PeacefulMeadow', 'StillWater', 'AmberGlow', 'BraveSparrow', 'SilentSky',
  'CedarBreeze', 'OceanMist', 'GoldenSun', 'SoftHorizon', 'MistyFern'
];

export class UserTerminal {
  constructor() {
    this.grounding = new GroundingController();
    this.activeCase = null;
    this.init();
  }

  init() {
    this.grounding.init();
    this.bindIntakeEvents();
    this.bindSessionEvents();
    this.syncFromState();

    // Subscribe to state updates
    state.subscribe(() => this.syncFromState());
  }

  bindIntakeEvents() {
    const randomBtn = document.getElementById('btn-random-pseudonym');
    const pseudoInput = document.getElementById('input-pseudonym');
    const intakeForm = document.getElementById('user-intake-form');

    if (randomBtn && pseudoInput) {
      randomBtn.addEventListener('click', () => {
        const rand = PSEUDONYMS[Math.floor(Math.random() * PSEUDONYMS.length)];
        pseudoInput.value = rand;
      });
      // Initial random suggestion
      if (!pseudoInput.value) {
        pseudoInput.value = PSEUDONYMS[Math.floor(Math.random() * PSEUDONYMS.length)];
      }
    }

    if (intakeForm) {
      intakeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleIntakeSubmit();
      });
    }
  }

  handleIntakeSubmit() {
    const pseudonym = document.getElementById('input-pseudonym')?.value || 'SafeSeeker';
    const categoryEl = document.querySelector('input[name="user_category"]:checked');
    const category = categoryEl ? categoryEl.value : 'anxiety';
    const tierEl = document.querySelector('input[name="emergency_tier"]:checked');
    const emergencyTier = tierEl ? tierEl.value : 'tier-4';

    const newCase = state.createCase({
      pseudonym,
      category,
      emergencyTier
    });

    sync.broadcast('NEW_CASE', newCase);

    if (newCase.isEmergency) {
      sync.playChime('urgent');
    }

    this.renderSessionScreen(newCase);
  }

  bindSessionEvents() {
    const sendBtn = document.getElementById('user-send-btn');
    const chatInput = document.getElementById('user-chat-input');
    const groundingToggle = document.getElementById('toggle-grounding-btn');
    const drawerClose = document.getElementById('close-grounding-btn');
    const endSessionBtn = document.getElementById('end-session-btn');

    const handleSend = () => {
      const text = chatInput?.value.trim();
      if (!text || !this.activeCase) return;

      chatInput.value = '';

      state.addMessage({
        caseId: this.activeCase.id,
        sender: 'user',
        senderName: this.activeCase.pseudonym,
        text
      });

      sync.broadcast('NEW_MESSAGE', { caseId: this.activeCase.id });
      sync.playChime('soft');
      this.scrollToBottom();
    };

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
    }

    // Quick prompt pills
    const pills = document.querySelectorAll('.quick-prompt-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        if (chatInput) {
          chatInput.value = pill.textContent.replace(/^"|"$/g, '');
          chatInput.focus();
        }
      });
    });

    // Grounding drawer toggles
    if (groundingToggle) {
      groundingToggle.addEventListener('click', () => {
        const drawer = document.getElementById('user-grounding-drawer');
        if (drawer) drawer.classList.toggle('collapsed');
      });
    }

    if (drawerClose) {
      drawerClose.addEventListener('click', () => {
        const drawer = document.getElementById('user-grounding-drawer');
        if (drawer) drawer.classList.add('collapsed');
      });
    }

    if (endSessionBtn) {
      endSessionBtn.addEventListener('click', () => {
        if (confirm('Are you sure you wish to exit your private session?')) {
          if (this.activeCase) {
            state.updateCaseStatus(this.activeCase.id, 'resolved');
          }
          state.setActiveUserCase(null);
          this.showIntakeScreen();
        }
      });
    }
  }

  syncFromState() {
    this.activeCase = state.getActiveUserCase();
    if (this.activeCase && this.activeCase.status !== 'resolved') {
      this.renderSessionScreen(this.activeCase);
      this.renderMessages();
    } else {
      this.showIntakeScreen();
    }
  }

  showIntakeScreen() {
    const intakeScreen = document.getElementById('user-intake-screen');
    const sessionScreen = document.getElementById('user-session-screen');
    if (intakeScreen) intakeScreen.style.display = 'flex';
    if (sessionScreen) sessionScreen.classList.remove('active');
  }

  renderSessionScreen(userCase) {
    this.activeCase = userCase;
    const intakeScreen = document.getElementById('user-intake-screen');
    const sessionScreen = document.getElementById('user-session-screen');

    if (intakeScreen) intakeScreen.style.display = 'none';
    if (sessionScreen) sessionScreen.classList.add('active');

    // Header info
    const nameEl = document.getElementById('user-session-pseudonym');
    const categoryEl = document.getElementById('user-session-category');
    const tierEl = document.getElementById('user-session-tier');
    const emergencyBanner = document.getElementById('user-emergency-banner');

    const tierMeta = EMERGENCY_TIERS[userCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    const catMeta = CATEGORIES[userCase.category] || CATEGORIES['anxiety'];

    if (nameEl) nameEl.textContent = userCase.pseudonym;
    if (categoryEl) {
      categoryEl.textContent = `${catMeta.icon} ${catMeta.label}`;
    }
    if (tierEl) {
      tierEl.className = `badge ${tierMeta.badgeClass}`;
      tierEl.textContent = tierMeta.shortTitle;
      if (tierMeta.isEmergency) {
        tierEl.classList.add('indicator-critical');
      } else {
        tierEl.classList.remove('indicator-critical');
      }
    }

    // Show/hide emergency banner
    if (emergencyBanner) {
      if (tierMeta.isEmergency) {
        emergencyBanner.style.display = 'flex';
      } else {
        emergencyBanner.style.display = 'none';
      }
    }

    this.renderMessages();
  }

  renderMessages() {
    if (!this.activeCase) return;
    const container = document.getElementById('user-chat-messages');
    if (!container) return;

    const messages = state.getMessagesForCase(this.activeCase.id);
    container.innerHTML = '';

    messages.forEach(msg => {
      const row = document.createElement('div');
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (msg.sender === 'system') {
        row.className = 'system-notice msg-animate';
        row.innerHTML = `<span>${this.escapeHtml(msg.text)}</span>`;
      } else {
        const isUser = msg.sender === 'user';
        row.className = `message-bubble-row ${isUser ? 'user' : 'counselor'} msg-animate`;
        row.innerHTML = `
          <div class="message-sender">${isUser ? 'You (' + this.escapeHtml(msg.senderName) + ')' : this.escapeHtml(msg.senderName)}</div>
          <div class="message-bubble">${this.escapeHtml(msg.text)}</div>
          <div class="message-timestamp">${timeStr}</div>
        `;
      }
      container.appendChild(row);
    });

    this.scrollToBottom();
  }

  scrollToBottom() {
    const container = document.getElementById('user-chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
