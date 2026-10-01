/* ==========================================================================
   TUMAINI - STAFF COMMAND CONTROLLER (UGANDA)
   - Staff Registration & Operator ID (STF-XXXX)
   - Shift Clock-In / Clock-Out Duty Engine
   - Strict Emergency Triage Queue & 1-on-1 Clinical Desk
   - Group Room Assignment & Invitation Engine
   - Confession Moderation Desk (Approve/Reject)
   ========================================================================== */

import { auth } from './auth.js';
import { store, EMERGENCY_TIERS } from './store.js';
import { bus } from './bus.js';

class TumainiStaff {
  constructor() {
    this.activeIntake = null;
    this.activeDesk = 'triage'; // 'triage' | 'confessions'
    this.shiftTimerInterval = null;

    this.initElements();
    this.bindEvents();
    this.checkSession();
    this.initSubscriptions();
  }

  initElements() {
    // Top Screens
    this.authScreen = document.getElementById('staffAuthScreen');
    this.consoleScreen = document.getElementById('staffConsoleScreen');

    // Auth Elements
    this.tabLogin = document.getElementById('tabLogin');
    this.tabRegister = document.getElementById('tabRegister');
    this.loginForm = document.getElementById('staffLoginForm');
    this.registerForm = document.getElementById('staffRegisterForm');
    this.authNotice = document.getElementById('staffAuthNotice');
    this.authNoticeText = document.getElementById('authNoticeText');
    this.loginIdInput = document.getElementById('loginStaffId');
    this.loginPassInput = document.getElementById('loginPassword');
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

    // Desk Navigation
    this.btnDeskTriage = document.getElementById('btnDeskTriage');
    this.btnDeskConfessions = document.getElementById('btnDeskConfessions');
    this.deskTriagePane = document.getElementById('deskTriagePane');
    this.deskConfessionsPane = document.getElementById('deskConfessionsPane');
    this.badgePendingConfessions = document.getElementById('badgePendingConfessions');

    // Triage Queue Elements
    this.queueList = document.getElementById('queueTicketsList');
    this.statWaiting = document.getElementById('statWaiting');
    this.statCritical = document.getElementById('statCritical');

    // 1-on-1 Workspace Elements
    this.workspaceEmptyState = document.getElementById('workspaceEmptyState');
    this.workspaceActivePane = document.getElementById('workspaceActivePane');
    this.workspaceSeekerName = document.getElementById('workspaceSeekerName');
    this.workspaceTierBadge = document.getElementById('workspaceTierBadge');
    this.workspaceCategoryTag = document.getElementById('workspaceCategoryTag');
    this.btnReleaseCase = document.getElementById('btnReleaseCase');
    this.counselorMessagesList = document.getElementById('counselorMessagesList');
    this.counselorInput = document.getElementById('counselorTextInput');
    this.btnCounselorSend = document.getElementById('btnCounselorSend');

    // Group Room Assignment Controls
    this.selectGroupRoom = document.getElementById('selectGroupRoom');
    this.inputNewRoomTitle = document.getElementById('inputNewRoomTitle');
    this.btnCreateAndInviteRoom = document.getElementById('btnCreateAndInviteRoom');
    this.btnInviteSelectedRoom = document.getElementById('btnInviteSelectedRoom');

    // Confession Moderation Desk
    this.pendingConfessionsList = document.getElementById('pendingConfessionsList');
  }

  bindEvents() {
    // Auth Tab Switching
    if (this.tabLogin) this.tabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    if (this.tabRegister) this.tabRegister.addEventListener('click', () => this.switchAuthTab('register'));

    // Forms
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // Duty Strip
    if (this.btnClockIn) this.btnClockIn.addEventListener('click', () => this.handleClockIn());
    if (this.btnClockOut) this.btnClockOut.addEventListener('click', () => this.handleClockOut());
    if (this.btnLogout) this.btnLogout.addEventListener('click', () => this.handleLogout());

    // Desk Switching
    if (this.btnDeskTriage) this.btnDeskTriage.addEventListener('click', () => this.switchDesk('triage'));
    if (this.btnDeskConfessions) this.btnDeskConfessions.addEventListener('click', () => this.switchDesk('confessions'));

    // Queue Item Clicks
    if (this.queueList) {
      this.queueList.addEventListener('click', (e) => {
        const card = e.target.closest('.queue-ticket-card');
        if (!card) return;
        const intakeId = card.dataset.intakeId;
        const target = store.intakes.find(i => i.id === intakeId);
        if (target) {
          if (e.target.closest('.btn-claim-case')) {
            this.claimCase(target);
          } else {
            this.selectCase(target);
          }
        }
      });
    }

    // 1-on-1 Counselor Messaging
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
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.counselorInput) {
          this.counselorInput.value = btn.dataset.snippet || btn.textContent.trim();
          this.counselorInput.focus();
        }
      });
    });

    // Close Case
    if (this.btnReleaseCase) {
      this.btnReleaseCase.addEventListener('click', () => {
        if (this.activeIntake) {
          const intakeId = this.activeIntake.id;
          store.updateIntakeStatus(intakeId, 'resolved');
          bus.broadcast('INTAKE_STATUS', { intakeId, status: 'resolved' });
          store.setActiveStaffIntake(null);
          this.activeIntake = null;
          this.renderWorkspace();
          this.renderQueue();
        }
      });
    }

    // Group Room Assignment Actions
    if (this.btnInviteSelectedRoom) {
      this.btnInviteSelectedRoom.addEventListener('click', () => {
        this.handleInviteExistingRoom();
      });
    }
    if (this.btnCreateAndInviteRoom) {
      this.btnCreateAndInviteRoom.addEventListener('click', () => {
        this.handleCreateAndInviteRoom();
      });
    }

    // Confession Moderation Actions
    if (this.pendingConfessionsList) {
      this.pendingConfessionsList.addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.btn-approve');
        const rejectBtn = e.target.closest('.btn-reject');
        if (approveBtn) {
          const confessionId = approveBtn.dataset.confessionId;
          store.approveConfession(confessionId);
          bus.broadcast('CONFESSION_STATUS', { confessionId, status: 'approved' });
          this.renderConfessionsDesk();
        } else if (rejectBtn) {
          const confessionId = rejectBtn.dataset.confessionId;
          store.rejectConfession(confessionId);
          bus.broadcast('CONFESSION_STATUS', { confessionId, status: 'rejected' });
          this.renderConfessionsDesk();
        }
      });
    }
  }

  initSubscriptions() {
    store.subscribe(() => {
      this.renderQueue();
      this.renderRoomSelectDropdown();
      this.renderConfessionsDesk();

      if (this.activeIntake) {
        const updated = store.intakes.find(i => i.id === this.activeIntake.id);
        if (updated) {
          this.activeIntake = updated;
          this.renderMessages();
          this.syncWorkspaceHeader();
        } else {
          this.activeIntake = null;
          this.renderWorkspace();
        }
      }
    });

    auth.subscribe(() => {
      this.syncDutyStrip();
    });
  }

  checkSession() {
    if (auth.isAuthenticated()) {
      this.showConsole();
      this.syncDutyStrip();
      this.renderQueue();
      this.renderRoomSelectDropdown();
      this.renderConfessionsDesk();

      const active = store.getActiveStaffIntake();
      if (active && active.status !== 'resolved') {
        this.selectCase(active);
      } else {
        const queue = store.getTriageQueue();
        if (queue.length > 0 && !this.activeIntake) {
          this.selectCase(queue[0]);
        } else {
          this.renderWorkspace();
        }
      }
    } else {
      this.showAuth();
    }
  }

  showAuth() {
    if (this.authScreen) {
      this.authScreen.style.display = 'flex';
    }
    if (this.consoleScreen) {
      this.consoleScreen.classList.remove('active');
      this.consoleScreen.style.display = 'none';
    }
  }

  showConsole() {
    if (this.authScreen) {
      this.authScreen.style.display = 'none';
    }
    if (this.consoleScreen) {
      this.consoleScreen.classList.add('active');
      this.consoleScreen.style.display = 'flex';
    }
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

  switchDesk(desk) {
    this.activeDesk = desk;
    if (desk === 'triage') {
      this.btnDeskTriage.classList.add('active');
      this.btnDeskConfessions.classList.remove('active');
      this.deskTriagePane.classList.add('active');
      this.deskConfessionsPane.classList.remove('active');
    } else {
      this.btnDeskConfessions.classList.add('active');
      this.btnDeskTriage.classList.remove('active');
      this.deskConfessionsPane.classList.add('active');
      this.deskTriagePane.classList.remove('active');
      this.renderConfessionsDesk();
    }
  }

  handleLogin() {
    const staffId = this.loginIdInput ? this.loginIdInput.value.trim() : '';
    const password = this.loginPassInput ? this.loginPassInput.value : '';

    if (!staffId || !password) {
      this.showAuthNotice('Please enter Staff ID and Password.', true);
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
      if (this.loginIdInput) this.loginIdInput.value = res.staffId;
      if (this.loginPassInput) this.loginPassInput.value = password;

      this.switchAuthTab('login');
      this.showAuthNotice(
        `Staff registration complete. Your Operator ID is <strong>${res.staffId}</strong>. You can now sign in.`,
        false
      );
    } else {
      this.showAuthNotice(res.error, true);
    }
  }

  showAuthNotice(msg, isError) {
    if (!this.authNotice || !this.authNoticeText) return;
    this.authNoticeText.innerHTML = msg;
    this.authNotice.style.display = 'block';
    if (isError) {
      this.authNotice.style.background = 'rgba(230, 57, 70, 0.15)';
      this.authNotice.style.borderColor = 'rgba(230, 57, 70, 0.4)';
      this.authNotice.style.color = '#fca5a5';
    } else {
      this.authNotice.style.background = 'rgba(82, 183, 136, 0.15)';
      this.authNotice.style.borderColor = 'rgba(82, 183, 136, 0.4)';
      this.authNotice.style.color = '#a7f3d0';
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
        this.dutyStatusBadge.className = 'badge badge-t4';
        this.dutyStatusBadge.textContent = 'ACTIVE ON DUTY';
      }
      if (this.btnClockIn) this.btnClockIn.style.display = 'none';
      if (this.btnClockOut) this.btnClockOut.style.display = 'inline-block';
      this.startShiftTimer(session.shiftStartedAt);
    } else {
      if (this.dutyStatusBadge) {
        this.dutyStatusBadge.className = 'badge';
        this.dutyStatusBadge.style.background = 'rgba(100, 116, 139, 0.2)';
        this.dutyStatusBadge.style.color = '#94a3b8';
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
    if (confirm('Clock out of your shift? Active cases will need handover.')) {
      auth.clockOut();
      this.syncDutyStrip();
    }
  }

  handleLogout() {
    if (auth.isOnDuty() && !confirm('You are clocked in. Logging out will end your shift. Continue?')) {
      return;
    }
    auth.logout();
    this.stopShiftTimer();
    this.activeIntake = null;
    this.showAuth();
  }

  startShiftTimer(startTime) {
    this.stopShiftTimer();
    const update = () => {
      const elapsed = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
      const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      if (this.shiftTimerDisplay) {
        this.shiftTimerDisplay.textContent = `Shift: ${hrs}:${mins}:${secs}`;
      }
    };
    update();
    this.shiftTimerInterval = setInterval(update, 1000);
  }

  stopShiftTimer() {
    clearInterval(this.shiftTimerInterval);
    if (this.shiftTimerDisplay) {
      this.shiftTimerDisplay.textContent = 'Shift: 00:00:00';
    }
  }

  // --- Queue Operations ---
  renderQueue() {
    if (!this.queueList) return;

    const queue = store.getTriageQueue();
    this.queueList.innerHTML = '';

    const waitingCount = queue.filter(i => i.status === 'waiting').length;
    const criticalCount = queue.filter(i => {
      const t = i.emergencyTier || i.tierId;
      return t === 'tier-1' || t === 'tier-2';
    }).length;

    if (this.statWaiting) this.statWaiting.textContent = waitingCount;
    if (this.statCritical) this.statCritical.textContent = criticalCount;

    if (queue.length === 0) {
      this.queueList.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: var(--text-muted); font-size: 13px;">
          All quiet. No incoming requests in queue.
        </div>
      `;
      return;
    }

    queue.forEach(item => {
      const tierId = item.emergencyTier || item.tierId || 'tier-4';
      const tierMeta = EMERGENCY_TIERS[tierId] || EMERGENCY_TIERS['tier-4'];
      const isSelected = this.activeIntake && this.activeIntake.id === item.id;
      const waitMins = Math.floor((Date.now() - item.createdAt) / 60000);

      const card = document.createElement('div');
      card.className = `queue-ticket-card ${tierId} ${isSelected ? 'active is-active-case' : ''}`;
      card.dataset.intakeId = item.id;

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 700; font-size: 14.5px;">${this.escapeHtml(item.username)}</span>
          <span style="font-size: 11px; font-family: monospace; color: var(--text-muted);">Wait: ${waitMins}m</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="badge ${tierMeta.badgeClass}">${tierMeta.tag}</span>
          <span style="font-size: 11px; color: var(--text-secondary); background: var(--bg-surface-elevated); padding: 2px 8px; border-radius: 4px;">
            ${this.escapeHtml(item.category)}
          </span>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${item.id}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
          <span style="font-size: 11px; color: ${item.status === 'in_session' ? '#52b788' : '#94a3b8'};">
            ${item.status === 'in_session' ? `• In Session (${this.escapeHtml(item.counselorName || 'Assigned')})` : '• Waiting for Counselor'}
          </span>
          <button class="btn-claim-case" type="button">
            ${item.status === 'in_session' ? 'Open Desk' : 'Accept Case'}
          </button>
        </div>
      `;

      this.queueList.appendChild(card);
    });
  }

  claimCase(item) {
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must Clock In on the top bar before claiming or handling support cases.');
      return;
    }

    store.claimIntake(item.id, session);
    bus.broadcast('INTAKE_CLAIMED', { intakeId: item.id, staffSession: session });
    this.selectCase(item);
  }

  selectCase(item) {
    this.activeIntake = store.intakes.find(i => i.id === item.id) || item;
    store.setActiveStaffIntake(this.activeIntake.id);
    this.renderWorkspace();
    this.renderQueue();
  }

  // --- Workspace Rendering ---
  renderWorkspace() {
    if (!this.activeIntake) {
      if (this.workspaceEmptyState) this.workspaceEmptyState.style.display = 'flex';
      if (this.workspaceActivePane) this.workspaceActivePane.classList.remove('active');
      return;
    }

    if (this.workspaceEmptyState) this.workspaceEmptyState.style.display = 'none';
    if (this.workspaceActivePane) this.workspaceActivePane.classList.add('active');

    this.syncWorkspaceHeader();
    this.renderMessages();
  }

  syncWorkspaceHeader() {
    if (!this.activeIntake) return;

    if (this.workspaceSeekerName) {
      this.workspaceSeekerName.textContent = this.activeIntake.username;
    }

    const tierId = this.activeIntake.emergencyTier || this.activeIntake.tierId || 'tier-4';
    const tierMeta = EMERGENCY_TIERS[tierId] || EMERGENCY_TIERS['tier-4'];
    if (this.workspaceTierBadge) {
      this.workspaceTierBadge.textContent = tierMeta.tag;
      this.workspaceTierBadge.className = `badge ${tierMeta.badgeClass}`;
    }

    if (this.workspaceCategoryTag) {
      this.workspaceCategoryTag.textContent = this.activeIntake.category;
    }
  }

  renderMessages() {
    if (!this.activeIntake || !this.counselorMessagesList) return;

    const messages = store.getIntakeMessages(this.activeIntake.id);
    this.counselorMessagesList.innerHTML = '';

    messages.forEach(msg => {
      const isSystem = msg.sender === 'system';
      const isCounselor = msg.sender === 'counselor';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isSystem) {
        const div = document.createElement('div');
        div.className = 'chat-system-row';
        div.textContent = msg.text;
        this.counselorMessagesList.appendChild(div);
      } else {
        const row = document.createElement('div');
        row.className = `chat-bubble-row ${isCounselor ? 'is-user' : 'is-counselor'}`;

        const senderLabel = isCounselor ? `You (${msg.senderName})` : (msg.senderName || 'Seeker');

        row.innerHTML = `
          <span class="chat-sender-label">${senderLabel}</span>
          <div class="chat-bubble-box" style="${isCounselor ? 'background: #2d6a4f; color: #fff;' : ''}">${this.escapeHtml(msg.text)}</div>
          <span class="chat-timestamp">${timeStr}</span>
        `;
        this.counselorMessagesList.appendChild(row);
      }
    });

    this.counselorMessagesList.scrollTop = this.counselorMessagesList.scrollHeight;
  }

  handleSendCounselorMessage() {
    if (!this.activeIntake || !this.counselorInput) return;
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must be Clocked In to message seekers.');
      return;
    }

    const text = this.counselorInput.value.trim();
    if (!text) return;

    const msg = store.addIntakeMessage({
      intakeId: this.activeIntake.id,
      sender: 'counselor',
      senderName: session.name,
      text
    });

    bus.broadcast('MESSAGE_SENT', { intakeId: this.activeIntake.id, message: msg });
    this.counselorInput.value = '';
    this.renderMessages();
  }

  // --- Group Room Assignment ---
  renderRoomSelectDropdown() {
    if (!this.selectGroupRoom) return;

    const rooms = store.groupRooms;
    this.selectGroupRoom.innerHTML = '';

    if (rooms.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No group circles created yet';
      this.selectGroupRoom.appendChild(opt);
      return;
    }

    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.title} (${r.members.length} peers)`;
      this.selectGroupRoom.appendChild(opt);
    });
  }

  handleInviteExistingRoom() {
    if (!this.activeIntake) {
      alert('Please select an active seeker first.');
      return;
    }
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must be Clocked In.');
      return;
    }

    const roomId = this.selectGroupRoom ? this.selectGroupRoom.value : '';
    const room = store.groupRooms.find(r => r.id === roomId);
    if (!room) {
      alert('Please select a valid group room or create one below.');
      return;
    }

    store.sendGroupInvite(this.activeIntake.id, {
      roomId: room.id,
      roomTitle: room.title,
      staffName: session.name
    });

    bus.broadcast('GROUP_INVITE_SENT', {
      intakeId: this.activeIntake.id,
      roomId: room.id,
      roomTitle: room.title,
      staffName: session.name
    });
    alert(`Invitation to "${room.title}" sent to ${this.activeIntake.username}.`);
  }

  handleCreateAndInviteRoom() {
    if (!this.activeIntake) {
      alert('Please select an active seeker first.');
      return;
    }
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must be Clocked In.');
      return;
    }

    const title = this.inputNewRoomTitle ? this.inputNewRoomTitle.value.trim() : '';
    if (!title) {
      alert('Please enter a group circle title (e.g. Tuition Anxiety Support).');
      return;
    }

    const newRoom = store.createGroupRoom({
      title,
      category: this.activeIntake.category,
      staffId: session.staffId
    });

    this.inputNewRoomTitle.value = '';
    this.renderRoomSelectDropdown();

    store.sendGroupInvite(this.activeIntake.id, {
      roomId: newRoom.id,
      roomTitle: newRoom.title,
      staffName: session.name
    });

    bus.broadcast('GROUP_INVITE_SENT', {
      intakeId: this.activeIntake.id,
      roomId: newRoom.id,
      roomTitle: newRoom.title,
      staffName: session.name
    });
    alert(`Circle "${newRoom.title}" created and invitation sent to ${this.activeIntake.username}.`);
  }

  // --- Confession Moderation Desk ---
  renderConfessionsDesk() {
    const pending = store.getPendingConfessions();
    if (this.badgePendingConfessions) {
      this.badgePendingConfessions.textContent = pending.length;
    }

    if (!this.pendingConfessionsList) return;
    this.pendingConfessionsList.innerHTML = '';

    if (pending.length === 0) {
      this.pendingConfessionsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;">
          All quiet. Zero pending confessions awaiting review.
        </div>
      `;
      return;
    }

    pending.forEach(item => {
      const card = document.createElement('div');
      card.className = 'pending-confession-card';

      const timeStr = new Date(item.createdAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      card.innerHTML = `
        <div class="pending-confession-header">
          <span style="font-weight: 700; color: var(--brand-acacia); font-size: 13px;">${this.escapeHtml(item.username)}</span>
          <span style="font-size: 11px; background: var(--bg-surface-elevated); padding: 2px 8px; border-radius: 4px; color: var(--text-secondary);">${this.escapeHtml(item.category)}</span>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${timeStr}</span>
        </div>
        <div class="pending-confession-text">
          ${this.escapeHtml(item.text)}
        </div>
        <div class="pending-confession-actions">
          <button class="btn-reject" type="button" data-confession-id="${item.id}">
            Decline
          </button>
          <button class="btn-approve" type="button" data-confession-id="${item.id}">
            Approve & Publish to Confession Room
          </button>
        </div>
      `;

      this.pendingConfessionsList.appendChild(card);
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TumainiStaff();
});
