/* ==========================================================================
   HAVEN CORE - STAFF TERMINAL CONTROLLER
   - Clinical Triage, Intake Queue & Shift Operations
   - Staff Registration & Operator ID (STF-XXXX) generation
   - Shift Clock-In / Clock-Out Duty Engine
   - Triage Queue strictly sorted by Emergency Severity (Tier 1 > 2 > 3 > 4)
   - Zero hardcoded demo data
   - Clinical De-escalation Snippets, Protocol Checklist, & Shift Notes
   ========================================================================== */

import { auth } from './auth.js';
import { store, EMERGENCY_TIERS, CATEGORIES } from './store.js';
import { bus } from './bus.js';

class StaffTerminal {
  constructor() {
    this.currentTierFilter = 'all';
    this.shiftTimerInterval = null;
    this.queueTimerInterval = null;
    this.activeCase = null;

    this.initElements();
    this.bindEvents();
    this.checkSession();
    this.initSubscriptions();
  }

  initElements() {
    // Top Screens
    this.authScreen = document.getElementById('staffAuthScreen');
    this.consoleScreen = document.getElementById('staffConsoleScreen');

    // Auth Forms & Tabs
    this.tabLogin = document.getElementById('tabLogin');
    this.tabRegister = document.getElementById('tabRegister');
    this.loginForm = document.getElementById('staffLoginForm');
    this.registerForm = document.getElementById('staffRegisterForm');
    this.authNotice = document.getElementById('staffAuthNotice');
    this.authNoticeText = document.getElementById('authNoticeText');

    // Login Inputs
    this.loginIdInput = document.getElementById('loginStaffId');
    this.loginPassInput = document.getElementById('loginPassword');

    // Register Inputs
    this.regNameInput = document.getElementById('regStaffName');
    this.regRoleSelect = document.getElementById('regStaffRole');
    this.regPassInput = document.getElementById('regPassword');

    // Duty Strip
    this.staffOperatorTag = document.getElementById('staffOperatorTag');
    this.staffNameDisplay = document.getElementById('staffNameDisplay');
    this.staffRoleDisplay = document.getElementById('staffRoleDisplay');
    this.dutyStatusBadge = document.getElementById('dutyStatusBadge');
    this.shiftTimerDisplay = document.getElementById('shiftTimerDisplay');
    this.btnClockIn = document.getElementById('btnClockIn');
    this.btnClockOut = document.getElementById('btnClockOut');
    this.btnLogout = document.getElementById('btnLogout');

    // Queue Elements
    this.statWaiting = document.getElementById('statWaiting');
    this.statInSession = document.getElementById('statInSession');
    this.statCritical = document.getElementById('statCritical');
    this.filterChipsWrap = document.getElementById('queueFilterRow');
    this.queueList = document.getElementById('queueTicketsList');

    // Workspace Elements
    this.workspaceEmptyState = document.getElementById('workspaceEmptyState');
    this.workspaceActivePane = document.getElementById('workspaceActivePane');
    this.workspaceSeekerName = document.getElementById('workspaceSeekerName');
    this.workspaceTierBadge = document.getElementById('workspaceTierBadge');
    this.workspaceCaseIdTag = document.getElementById('workspaceCaseIdTag');
    this.workspaceCategoryTag = document.getElementById('workspaceCategoryTag');
    this.caseStatusSelect = document.getElementById('caseStatusSelect');
    this.btnReleaseCase = document.getElementById('btnReleaseCase');

    // Chat
    this.counselorMessagesList = document.getElementById('counselorMessagesList');
    this.counselorInput = document.getElementById('counselorTextInput');
    this.btnCounselorSend = document.getElementById('btnCounselorSend');
    this.snippetsList = document.getElementById('snippetsList');

    // Clinical Notes & Protocol Checklist
    this.chkHarmCheck = document.getElementById('chkHarmCheck');
    this.chkGroundingOffered = document.getElementById('chkGroundingOffered');
    this.chkHotlineProvided = document.getElementById('chkHotlineProvided');
    this.clinicalNotesArea = document.getElementById('clinicalNotesArea');
  }

  bindEvents() {
    // Auth Tab Switch
    if (this.tabLogin) {
      this.tabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    }
    if (this.tabRegister) {
      this.tabRegister.addEventListener('click', () => this.switchAuthTab('register'));
    }

    // Login Form Submit
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Register Form Submit
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // Duty Strip Buttons
    if (this.btnClockIn) {
      this.btnClockIn.addEventListener('click', () => this.handleClockIn());
    }
    if (this.btnClockOut) {
      this.btnClockOut.addEventListener('click', () => this.handleClockOut());
    }
    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', () => this.handleLogout());
    }

    // Queue Tier Filters
    if (this.filterChipsWrap) {
      this.filterChipsWrap.addEventListener('click', (e) => {
        const pill = e.target.closest('.queue-filter-pill');
        if (pill) {
          document.querySelectorAll('.queue-filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentTierFilter = pill.dataset.tier || 'all';
          this.renderQueue();
        }
      });
    }

    // Queue List Item Clicks (Claim / Select)
    if (this.queueList) {
      this.queueList.addEventListener('click', (e) => {
        const ticketCard = e.target.closest('.queue-ticket-card');
        if (!ticketCard) return;

        const caseId = ticketCard.dataset.caseId;
        const targetCase = store.cases.find(c => c.id === caseId);
        if (!targetCase) return;

        if (e.target.closest('.btn-claim-case')) {
          this.claimTicket(targetCase);
        } else {
          this.selectCase(targetCase);
        }
      });
    }

    // Workspace Status Select
    if (this.caseStatusSelect) {
      this.caseStatusSelect.addEventListener('change', (e) => {
        if (this.activeCase) {
          store.updateCaseStatus(this.activeCase.id, e.target.value);
          if (e.target.value === 'resolved') {
            bus.broadcast('CASE_RESOLVED', { caseId: this.activeCase.id });
          }
        }
      });
    }

    // Release / Close Case
    if (this.btnReleaseCase) {
      this.btnReleaseCase.addEventListener('click', () => {
        if (this.activeCase) {
          store.updateCaseStatus(this.activeCase.id, 'resolved');
          bus.broadcast('CASE_RESOLVED', { caseId: this.activeCase.id });
          store.setActiveStaffCase(null);
          this.activeCase = null;
          this.renderWorkspace();
          this.renderQueue();
        }
      });
    }

    // Counselor Chat Sending
    if (this.btnCounselorSend && this.counselorInput) {
      this.btnCounselorSend.addEventListener('click', () => this.handleSendCounselorMessage());
      this.counselorInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendCounselorMessage();
        }
      });
    }

    // Clinical Snippets
    if (this.snippetsList) {
      this.snippetsList.addEventListener('click', (e) => {
        const btn = e.target.closest('.snippet-btn');
        if (btn && this.counselorInput) {
          this.counselorInput.value = btn.dataset.snippet || btn.textContent.trim();
          this.counselorInput.focus();
        }
      });
    }

    // Protocol Checklist
    const bindChecklist = (el, key) => {
      if (el) {
        el.addEventListener('change', () => {
          if (this.activeCase) {
            store.updateChecklist(this.activeCase.id, key, el.checked);
          }
        });
      }
    };
    bindChecklist(this.chkHarmCheck, 'harmCheck');
    bindChecklist(this.chkGroundingOffered, 'groundingOffered');
    bindChecklist(this.chkHotlineProvided, 'hotlineProvided');

    // Clinical Notes auto-save
    if (this.clinicalNotesArea) {
      this.clinicalNotesArea.addEventListener('input', () => {
        if (this.activeCase) {
          store.updateCaseNotes(this.activeCase.id, this.clinicalNotesArea.value);
        }
      });
    }
  }

  initSubscriptions() {
    // Store updates
    store.subscribe(() => {
      this.updateStats();
      this.renderQueue();

      if (this.activeCase) {
        const updated = store.cases.find(c => c.id === this.activeCase.id);
        if (updated) {
          this.activeCase = updated;
          this.renderMessages();
          this.syncWorkspaceHeader();
        } else {
          this.activeCase = null;
          this.renderWorkspace();
        }
      }
    });

    // Auth updates
    auth.subscribe(() => {
      this.syncDutyStrip();
    });

    // Live wait timer updater every 5 seconds
    clearInterval(this.queueTimerInterval);
    this.queueTimerInterval = setInterval(() => {
      this.updateQueueWaitClocks();
    }, 5000);
  }

  checkSession() {
    if (auth.isAuthenticated()) {
      this.showConsole();
      this.syncDutyStrip();
      this.updateStats();
      this.renderQueue();

      // Check if there was an active case
      const activeStaffCase = store.getActiveStaffCase();
      if (activeStaffCase && activeStaffCase.status !== 'resolved') {
        this.selectCase(activeStaffCase);
      } else {
        this.renderWorkspace();
      }
    } else {
      this.showAuth();
    }
  }

  showAuth() {
    if (this.authScreen) this.authScreen.style.display = 'flex';
    if (this.consoleScreen) this.consoleScreen.classList.remove('active');
  }

  showConsole() {
    if (this.authScreen) this.authScreen.style.display = 'none';
    if (this.consoleScreen) this.consoleScreen.classList.add('active');
  }

  switchAuthTab(tab) {
    if (tab === 'login') {
      this.tabLogin.classList.add('active');
      this.tabRegister.classList.remove('active');
      this.loginForm.style.display = 'flex';
      this.registerForm.style.display = 'none';
    } else {
      this.tabRegister.classList.add('active');
      this.tabLogin.classList.remove('active');
      this.registerForm.style.display = 'flex';
      this.loginForm.style.display = 'none';
    }
  }

  handleLogin() {
    const staffId = this.loginIdInput ? this.loginIdInput.value.trim() : '';
    const password = this.loginPassInput ? this.loginPassInput.value : '';

    if (!staffId || !password) {
      this.showAuthNotice('Please enter both your Staff ID and Password.', true);
      return;
    }

    const res = auth.login({ staffId, password });
    if (res.success) {
      this.hideAuthNotice();
      this.showConsole();
      this.syncDutyStrip();
      this.renderQueue();
    } else {
      this.showAuthNotice(res.error, true);
    }
  }

  handleRegister() {
    const name = this.regNameInput ? this.regNameInput.value.trim() : '';
    const role = this.regRoleSelect ? this.regRoleSelect.value : 'Crisis Counselor';
    const password = this.regPassInput ? this.regPassInput.value : '';

    if (!name || !password) {
      this.showAuthNotice('Full name and password are required.', true);
      return;
    }

    const res = auth.register({ name, role, password });
    if (res.success) {
      // Auto-fill login field and show success message
      if (this.loginIdInput) this.loginIdInput.value = res.staffId;
      if (this.loginPassInput) this.loginPassInput.value = password;

      this.switchAuthTab('login');
      this.showAuthNotice(
        `Registration successful! Your unique Staff ID is <strong>${res.staffId}</strong>. Credentials are saved for sign in.`,
        false
      );
    } else {
      this.showAuthNotice(res.error, true);
    }
  }

  showAuthNotice(msg, isError = false) {
    if (!this.authNotice || !this.authNoticeText) return;
    this.authNoticeText.innerHTML = msg;
    this.authNotice.style.display = 'block';
    if (isError) {
      this.authNotice.style.background = 'rgba(239, 68, 68, 0.15)';
      this.authNotice.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      this.authNotice.style.color = '#fca5a5';
    } else {
      this.authNotice.style.background = 'rgba(16, 185, 129, 0.15)';
      this.authNotice.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      this.authNotice.style.color = '#6ee7b7';
    }
  }

  hideAuthNotice() {
    if (this.authNotice) this.authNotice.style.display = 'none';
  }

  // --- Duty Strip Operations ---
  syncDutyStrip() {
    const session = auth.getSession();
    if (!session) return;

    if (this.staffOperatorTag) this.staffOperatorTag.textContent = session.staffId;
    if (this.staffNameDisplay) this.staffNameDisplay.textContent = session.name;
    if (this.staffRoleDisplay) this.staffRoleDisplay.textContent = session.role;

    if (session.isOnDuty) {
      if (this.dutyStatusBadge) {
        this.dutyStatusBadge.className = 'badge badge-duty-active';
        this.dutyStatusBadge.textContent = 'ACTIVE ON DUTY';
      }
      if (this.btnClockIn) this.btnClockIn.style.display = 'none';
      if (this.btnClockOut) this.btnClockOut.style.display = 'inline-block';
      this.startShiftTimer(session.shiftStartedAt);
    } else {
      if (this.dutyStatusBadge) {
        this.dutyStatusBadge.className = 'badge badge-duty-off';
        this.dutyStatusBadge.textContent = 'OFF DUTY';
      }
      if (this.btnClockIn) this.btnClockIn.style.display = 'inline-block';
      if (this.btnClockOut) this.btnClockOut.style.display = 'none';
      this.stopShiftTimer();
    }
  }

  handleClockIn() {
    auth.clockIn();
    this.syncDutyStrip();
  }

  handleClockOut() {
    if (confirm('Clock out and end your shift? Active cases should be resolved or handed over.')) {
      auth.clockOut();
      this.syncDutyStrip();
    }
  }

  handleLogout() {
    if (auth.isOnDuty()) {
      if (!confirm('You are currently clocked in. Logging out will end your shift. Continue?')) {
        return;
      }
    }
    auth.logout();
    this.stopShiftTimer();
    this.activeCase = null;
    this.showAuth();
  }

  startShiftTimer(startTime) {
    this.stopShiftTimer();
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
      const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      if (this.shiftTimerDisplay) {
        this.shiftTimerDisplay.textContent = `Shift: ${hrs}:${mins}:${secs}`;
      }
    };
    updateTimer();
    this.shiftTimerInterval = setInterval(updateTimer, 1000);
  }

  stopShiftTimer() {
    clearInterval(this.shiftTimerInterval);
    if (this.shiftTimerDisplay) {
      this.shiftTimerDisplay.textContent = 'Shift: 00:00:00';
    }
  }

  // --- Queue Operations ---
  updateStats() {
    const all = store.cases.filter(c => c.status !== 'resolved');
    const waiting = all.filter(c => c.status === 'waiting').length;
    const inSession = all.filter(c => c.status === 'in_session').length;
    const critical = all.filter(c => c.emergencyTier === 'tier-1' || c.emergencyTier === 'tier-2').length;

    if (this.statWaiting) this.statWaiting.textContent = waiting;
    if (this.statInSession) this.statInSession.textContent = inSession;
    if (this.statCritical) this.statCritical.textContent = critical;
  }

  renderQueue() {
    if (!this.queueList) return;

    const sortedCases = store.getQueueSortedByEmergency(this.currentTierFilter);
    this.queueList.innerHTML = '';

    if (sortedCases.length === 0) {
      this.queueList.innerHTML = `
        <div class="empty-queue-notice">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
          <h4>All Quiet. No Active Requests</h4>
          <p style="font-size: 12px; line-height: 1.5;">The triage queue is completely clear. Incoming requests will appear here ranked by emergency urgency.</p>
        </div>
      `;
      return;
    }

    sortedCases.forEach(item => {
      const tierMeta = EMERGENCY_TIERS[item.emergencyTier] || EMERGENCY_TIERS['tier-4'];
      const catMeta = CATEGORIES[item.category];
      const isSelected = this.activeCase && this.activeCase.id === item.id;
      const waitTimeText = this.formatWaitTime(item.createdAt);

      const card = document.createElement('div');
      card.className = `queue-ticket-card ${item.emergencyTier} ${isSelected ? 'is-active-case' : ''}`;
      card.dataset.caseId = item.id;

      card.innerHTML = `
        <div class="ticket-header-line">
          <span class="ticket-seeker-name">${this.escapeHtml(item.pseudonym)}</span>
          <span class="ticket-wait-clock ${tierMeta.isEmergency ? 'is-urgent' : ''}" data-created="${item.createdAt}">
            Wait: ${waitTimeText}
          </span>
        </div>
        <div class="ticket-tags-row">
          <span class="badge ${tierMeta.badgeClass}">${tierMeta.tag}</span>
          <span style="font-size: 11px; color: var(--text-secondary); background: var(--bg-surface-elevated); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            ${catMeta ? catMeta.label : item.category}
          </span>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${item.id}</span>
        </div>
        <div class="ticket-card-actions">
          <span style="font-size: 11px; color: ${item.status === 'in_session' ? '#a78bfa' : '#64748b'}; font-weight: 600;">
            ${item.status === 'in_session' ? `• In Session (${this.escapeHtml(item.counselorName || 'Assigned')})` : '• Waiting for Counselor'}
          </span>
          <button class="btn-claim-case" type="button">
            ${item.status === 'in_session' ? 'Open Desk' : 'Claim Case'}
          </button>
        </div>
      `;

      this.queueList.appendChild(card);
    });
  }

  updateQueueWaitClocks() {
    if (!this.queueList) return;
    const clocks = this.queueList.querySelectorAll('.ticket-wait-clock');
    clocks.forEach(clock => {
      const created = parseInt(clock.dataset.created, 10);
      if (created) {
        clock.textContent = `Wait: ${this.formatWaitTime(created)}`;
      }
    });
  }

  formatWaitTime(createdAt) {
    const elapsed = Math.floor((Date.now() - createdAt) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}m ${secs}s`;
  }

  claimTicket(caseItem) {
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must Clock In on the top duty bar before claiming or handling support tickets.');
      return;
    }

    store.claimCase(caseItem.id, session);
    bus.broadcast('CASE_CLAIMED', { caseId: caseItem.id, counselorName: session.name });
    this.selectCase(caseItem);
  }

  selectCase(caseItem) {
    this.activeCase = store.cases.find(c => c.id === caseItem.id) || caseItem;
    store.setActiveStaffCase(this.activeCase.id);
    this.renderWorkspace();
    this.renderQueue();
  }

  // --- Counselor Workspace ---
  renderWorkspace() {
    if (!this.activeCase) {
      if (this.workspaceEmptyState) this.workspaceEmptyState.style.display = 'flex';
      if (this.workspaceActivePane) this.workspaceActivePane.classList.remove('active');
      return;
    }

    if (this.workspaceEmptyState) this.workspaceEmptyState.style.display = 'none';
    if (this.workspaceActivePane) this.workspaceActivePane.classList.add('active');

    this.syncWorkspaceHeader();
    this.renderMessages();
    this.syncChecklistAndNotes();
  }

  syncWorkspaceHeader() {
    if (!this.activeCase) return;

    if (this.workspaceSeekerName) {
      this.workspaceSeekerName.textContent = this.activeCase.pseudonym;
    }

    const tierMeta = EMERGENCY_TIERS[this.activeCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    if (this.workspaceTierBadge) {
      this.workspaceTierBadge.textContent = tierMeta.tag;
      this.workspaceTierBadge.className = `badge ${tierMeta.badgeClass}`;
    }

    if (this.workspaceCaseIdTag) {
      this.workspaceCaseIdTag.textContent = this.activeCase.id;
    }

    const catMeta = CATEGORIES[this.activeCase.category];
    if (this.workspaceCategoryTag) {
      this.workspaceCategoryTag.textContent = catMeta ? catMeta.label : this.activeCase.category;
    }

    if (this.caseStatusSelect) {
      this.caseStatusSelect.value = this.activeCase.status || 'in_session';
    }
  }

  renderMessages() {
    if (!this.activeCase || !this.counselorMessagesList) return;

    const messages = store.getMessagesForCase(this.activeCase.id);
    this.counselorMessagesList.innerHTML = '';

    messages.forEach(msg => {
      const isSystem = msg.sender === 'system';
      const isCounselor = msg.sender === 'counselor';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isSystem) {
        const div = document.createElement('div');
        div.className = 'system-message-row';
        div.textContent = msg.text;
        this.counselorMessagesList.appendChild(div);
      } else {
        const row = document.createElement('div');
        // From counselor perspective: counselor is on right (is-user style), user is on left (is-counselor style)
        row.className = `chat-bubble-row ${isCounselor ? 'is-user' : 'is-counselor'}`;

        const senderLabel = isCounselor ? `You (${msg.senderName || 'Counselor'})` : (msg.senderName || 'Seeker');

        row.innerHTML = `
          <span class="bubble-sender-name">${senderLabel}</span>
          <div class="bubble-content" style="${isCounselor ? 'background: #7c3aed; color: #fff;' : ''}">${this.escapeHtml(msg.text)}</div>
          <span class="bubble-timestamp">${timeStr}</span>
        `;
        this.counselorMessagesList.appendChild(row);
      }
    });

    this.counselorMessagesList.scrollTop = this.counselorMessagesList.scrollHeight;
  }

  handleSendCounselorMessage() {
    if (!this.activeCase || !this.counselorInput) return;
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must be Clocked In to send messages to seekers.');
      return;
    }

    const text = this.counselorInput.value.trim();
    if (!text) return;

    store.addMessage({
      caseId: this.activeCase.id,
      sender: 'counselor',
      senderName: session.name,
      text
    });

    bus.broadcast('MESSAGE_SENT', { caseId: this.activeCase.id, sender: 'counselor' });
    this.counselorInput.value = '';
    this.renderMessages();
  }

  syncChecklistAndNotes() {
    if (!this.activeCase) return;

    const chk = this.activeCase.checklist || {};
    if (this.chkHarmCheck) this.chkHarmCheck.checked = !!chk.harmCheck;
    if (this.chkGroundingOffered) this.chkGroundingOffered.checked = !!chk.groundingOffered;
    if (this.chkHotlineProvided) this.chkHotlineProvided.checked = !!chk.hotlineProvided;

    if (this.clinicalNotesArea) {
      this.clinicalNotesArea.value = this.activeCase.notes || '';
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
  new StaffTerminal();
});
