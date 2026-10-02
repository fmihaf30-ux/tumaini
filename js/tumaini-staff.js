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
import { supabase } from './supabase-client.js';

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
    this.loginForm = document.getElementById('staffLoginForm');
    this.authNotice = document.getElementById('staffAuthNotice');
    this.authNoticeText = document.getElementById('authNoticeText');
    this.loginIdInput = document.getElementById('loginStaffId');
    this.loginPassInput = document.getElementById('loginPassword');

    // Profile & Supervisor Desk Elements
    this.btnStaffProfile = document.getElementById('btnStaffProfile');
    this.staffProfileModal = document.getElementById('staffProfileModal');
    this.btnCloseStaffProfile = document.getElementById('btnCloseStaffProfile');
    this.btnProfileLogout = document.getElementById('btnProfileLogout');
    this.profileAvatarCircle = document.getElementById('profileAvatarCircle');
    this.profileNameDisplay = document.getElementById('profileNameDisplay');
    this.profileIdBadge = document.getElementById('profileIdBadge');
    this.profileRoleBadge = document.getElementById('profileRoleBadge');
    this.profileDutyBadge = document.getElementById('profileDutyBadge');
    this.supervisorDeskSection = document.getElementById('supervisorDeskSection');
    this.formGenerateCounselor = document.getElementById('formGenerateCounselor');
    this.genCounselorName = document.getElementById('genCounselorName');
    this.genCounselorRole = document.getElementById('genCounselorRole');
    this.genCounselorPassword = document.getElementById('genCounselorPassword');
    this.btnShufflePassword = document.getElementById('btnShufflePassword');
    this.genResultCard = document.getElementById('genResultCard');
    this.genResultPre = document.getElementById('genResultPre');
    this.btnCopyCredentials = document.getElementById('btnCopyCredentials');
    this.copyToastMessage = document.getElementById('copyToastMessage');
    this.counselorsRosterList = document.getElementById('counselorsRosterList');

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
    this.btnResetLocalData = document.getElementById('btnResetLocalData');
  }

  bindEvents() {
    // Login Form
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Profile & Supervisor Desk Modal Events
    if (this.btnStaffProfile) {
      this.btnStaffProfile.addEventListener('click', () => this.openProfileModal());
    }
    if (this.btnCloseStaffProfile) {
      this.btnCloseStaffProfile.addEventListener('click', () => this.closeProfileModal());
    }
    if (this.staffProfileModal) {
      this.staffProfileModal.addEventListener('click', (e) => {
        if (e.target === this.staffProfileModal) this.closeProfileModal();
      });
    }
    if (this.btnProfileLogout) {
      this.btnProfileLogout.addEventListener('click', () => {
        this.closeProfileModal();
        this.handleLogout();
      });
    }
    if (this.btnResetLocalData) {
      this.btnResetLocalData.addEventListener('click', () => this.handleResetLocalData());
    }
    if (this.btnShufflePassword && this.genCounselorPassword) {
      this.btnShufflePassword.addEventListener('click', () => {
        this.genCounselorPassword.value = auth.generateRandomPassword();
      });
    }
    if (this.formGenerateCounselor) {
      this.formGenerateCounselor.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleGenerateCounselor();
      });
    }
    if (this.btnCopyCredentials) {
      this.btnCopyCredentials.addEventListener('click', () => this.handleCopyCredentials());
    }
    // Multi-Device Shift Synchronization
    window.addEventListener('tumaini:shift-sync', (e) => {
      const session = auth.getSession();
      if (session && e.detail && e.detail.staffId && session.staffId.toUpperCase() === e.detail.staffId.toUpperCase()) {
        session.isOnDuty = !!e.detail.isOnDuty;
        session.shiftStartedAt = e.detail.shiftStartedAt || null;
        this.syncDutyStrip();
      }
    });

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
    if (this.btnStaffProfile) {
      this.btnStaffProfile.style.display = 'none';
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
    if (this.btnStaffProfile) {
      this.btnStaffProfile.style.display = 'inline-flex';
    }
  }

  switchDesk(desk) {
    if (desk === 'confessions') {
      if (this.btnDeskTriage) this.btnDeskTriage.classList.remove('active');
      if (this.btnDeskConfessions) this.btnDeskConfessions.classList.add('active');
      if (this.deskTriagePane) {
        this.deskTriagePane.classList.remove('active');
        this.deskTriagePane.style.display = 'none';
      }
      if (this.deskConfessionsPane) {
        this.deskConfessionsPane.classList.add('active');
        this.deskConfessionsPane.style.display = 'block';
      }
      this.renderConfessionsDesk();
    } else {
      if (this.btnDeskConfessions) this.btnDeskConfessions.classList.remove('active');
      if (this.btnDeskTriage) this.btnDeskTriage.classList.add('active');
      if (this.deskConfessionsPane) {
        this.deskConfessionsPane.classList.remove('active');
        this.deskConfessionsPane.style.display = 'none';
      }
      if (this.deskTriagePane) {
        this.deskTriagePane.classList.add('active');
        this.deskTriagePane.style.display = 'block';
      }
      this.renderQueue();
      this.renderWorkspace();
    }
  }

  handleResetLocalData() {
    if (confirm('Clear local queue and session cache? This will wipe cached intakes and re-sync fresh from Supabase.')) {
      try {
        localStorage.removeItem('tumaini_intakes_clean_v3');
        localStorage.removeItem('tumaini_intake_messages_clean_v3');
        localStorage.removeItem('tumaini_active_staff_intake_clean_v3');
        localStorage.removeItem('tumaini_campus_confessions_v2');
        localStorage.removeItem('tumaini_campus_confessions_clean_v4');
        localStorage.removeItem('tumaini_campus_confessions_clean_v5');
      } catch (e) {}
      location.reload();
    }
  }

  async handleLogin() {
    this.hideAuthNotice();
    const staffId = this.loginIdInput ? this.loginIdInput.value.trim() : '';
    const password = this.loginPassInput ? this.loginPassInput.value.trim() : '';

    if (!staffId || !password) {
      this.showAuthNotice('Please enter both Operator Staff ID and Password.', true);
      return;
    }

    const res = await auth.login({ staffId, password });
    if (res.success) {
      if (this.loginPassInput) this.loginPassInput.value = '';
      this.showConsole();
      this.syncDutyStrip();
      this.renderQueue();
      this.renderRoomSelectDropdown();
      this.renderConfessionsDesk();

      const queue = store.getTriageQueue();
      if (queue.length > 0 && !this.activeIntake) {
        this.selectCase(queue[0]);
      } else {
        this.renderWorkspace();
      }
    } else {
      this.showAuthNotice(res.error || 'Invalid credentials. Please verify your Operator ID and Password.', true);
    }
  }

  async openProfileModal() {
    if (!this.staffProfileModal) return;
    const session = auth.getSession();
    if (!session) {
      alert('Please sign in first.');
      return;
    }

    if (this.profileAvatarCircle) {
      const initials = session.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      this.profileAvatarCircle.textContent = initials || 'OP';
    }
    if (this.profileNameDisplay) this.profileNameDisplay.textContent = session.name;
    if (this.profileIdBadge) this.profileIdBadge.textContent = session.staffId;
    if (this.profileRoleBadge) this.profileRoleBadge.textContent = session.role;
    if (this.profileDutyBadge) {
      this.profileDutyBadge.textContent = session.isOnDuty ? 'ON DUTY' : 'OFF DUTY';
      this.profileDutyBadge.style.background = session.isOnDuty ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)';
      this.profileDutyBadge.style.color = session.isOnDuty ? '#10b981' : '#64748b';
    }

    // Supervisor Desk Visibility
    if (auth.isSupervisor()) {
      if (this.supervisorDeskSection) this.supervisorDeskSection.style.display = 'block';
      if (this.genCounselorPassword && !this.genCounselorPassword.value) {
        this.genCounselorPassword.value = auth.generateRandomPassword();
      }
      await this.renderCounselorsRoster();
    } else {
      if (this.supervisorDeskSection) this.supervisorDeskSection.style.display = 'none';
    }

    this.staffProfileModal.classList.add('open');
    this.staffProfileModal.classList.add('active');
  }

  closeProfileModal() {
    if (!this.staffProfileModal) return;
    this.staffProfileModal.classList.remove('open');
    this.staffProfileModal.classList.remove('active');
  }

  async handleGenerateCounselor() {
    const name = this.genCounselorName ? this.genCounselorName.value.trim() : '';
    const role = this.genCounselorRole ? this.genCounselorRole.value : 'Crisis Counselor';
    const password = this.genCounselorPassword ? this.genCounselorPassword.value.trim() : '';

    if (!name) {
      alert('Counselor full name is required.');
      return;
    }

    const res = await auth.createCounselor({ name, role, password });
    if (res.success) {
      if (this.genResultPre && this.genResultCard) {
        const text = [
          '==============================',
          'TUMAINI COUNSELOR CREDENTIALS',
          '==============================',
          `Counselor: ${res.staff.name}`,
          `Clinical Role: ${res.staff.role}`,
          `Operator ID: ${res.staffId}`,
          `Password: ${res.password}`,
          'Portal Login: https://tumaini-zeta.vercel.app/staff',
          '==============================',
          'Confidential. Do not share your login credentials with unauthorized individuals.'
        ].join('\n');

        this.genResultPre.textContent = text;
        this.genResultCard.style.display = 'block';
      }

      if (this.genCounselorName) this.genCounselorName.value = '';
      if (this.genCounselorPassword) this.genCounselorPassword.value = auth.generateRandomPassword();
      await this.renderCounselorsRoster();
    } else {
      alert(res.error || 'Failed to generate counselor credentials.');
    }
  }

  handleCopyCredentials() {
    if (!this.genResultPre) return;
    const text = this.genResultPre.textContent;
    navigator.clipboard.writeText(text).then(() => {
      if (this.copyToastMessage) {
        this.copyToastMessage.style.display = 'block';
        setTimeout(() => {
          if (this.copyToastMessage) this.copyToastMessage.style.display = 'none';
        }, 3500);
      }
    }).catch(err => {
      console.warn('Clipboard write failed', err);
      alert('Copied text: \n\n' + text);
    });
  }

  async renderCounselorsRoster() {
    if (!this.counselorsRosterList) return;
    const counselors = await auth.getCounselors();
    this.counselorsRosterList.innerHTML = '';

    if (counselors.length === 0) {
      this.counselorsRosterList.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 6px 0;">
          No counselor credentials generated yet. Use the form above to onboard counselors.
        </div>
      `;
      return;
    }

    counselors.forEach(c => {
      const item = document.createElement('div');
      item.className = 'counselor-roster-item';
      item.innerHTML = `
        <div>
          <strong style="color: var(--brand-eucalyptus-dark); font-family: monospace;">${c.staffId}</strong>
          <span style="margin: 0 4px; color: var(--text-muted);">&bull;</span>
          <span style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(c.name)}</span>
          <span style="font-size: 11.5px; color: var(--text-muted); margin-left: 6px;">(${this.escapeHtml(c.role)})</span>
        </div>
        <button type="button" class="btn-revoke-counselor" data-staff-id="${c.staffId}" style="background: none; border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer;">
          Revoke
        </button>
      `;

      item.querySelector('.btn-revoke-counselor').addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.staffId;
        if (confirm(`Revoke access for counselor ${c.name} (${id})? They will no longer be able to log in.`)) {
          await auth.deleteCounselor(id);
          await this.renderCounselorsRoster();
        }
      });

      this.counselorsRosterList.appendChild(item);
    });
  }

  showAuthNotice(msg, isError) {
    if (!this.authNotice || !this.authNoticeText) return;
    this.authNoticeText.textContent = msg;
    this.authNotice.style.display = 'block';
    if (isError) {
      this.authNotice.style.background = '#fdf2f2';
      this.authNotice.style.borderColor = '#f8c8c8';
      this.authNotice.style.color = '#c93b3b';
    } else {
      this.authNotice.style.background = '#eef7f4';
      this.authNotice.style.borderColor = '#c3e2d7';
      this.authNotice.style.color = '#2c4e43';
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
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--bg-surface-elevated); display: flex; align-items: center; justify-content: center; color: var(--brand-eucalyptus-dark);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div>
            <strong style="display: block; color: var(--text-primary); font-size: 13.5px; margin-bottom: 2px;">Triage Queue Clear</strong>
            <span style="font-size: 12px; color: var(--text-muted); line-height: 1.4; display: block;">No seekers waiting. Incoming requests will appear in real time.</span>
          </div>
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

    if (messages.length > 0) {
      const datePill = document.createElement('div');
      datePill.className = 'whatsapp-date-pill';
      datePill.textContent = 'TODAY';
      this.counselorMessagesList.appendChild(datePill);
    }

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
        row.className = `wa-bubble-row ${isCounselor ? 'is-outgoing' : 'is-incoming'}`;

        const senderLabel = isCounselor ? `You (${msg.senderName})` : (msg.senderName || 'Seeker');

        row.innerHTML = `
          <div class="wa-bubble-card">
            ${!isCounselor ? `<span class="wa-bubble-author">${this.escapeHtml(senderLabel)}</span>` : ''}
            <span class="wa-bubble-text">${this.escapeHtml(msg.text)}</span>
            <span class="wa-bubble-meta">
              ${timeStr}
              ${isCounselor ? '<span class="wa-check-ticks">✓✓</span>' : ''}
            </span>
          </div>
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
    setTimeout(() => {
      alert(`Invitation to "${room.title}" sent to ${this.activeIntake.username}.`);
    }, 10);
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
    setTimeout(() => {
      alert(`Circle "${newRoom.title}" created and invitation sent to ${this.activeIntake.username}.`);
    }, 10);
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
