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
import { renderHelplineCards } from './helplines.js';

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
    this.formEditSelfProfile = document.getElementById('formEditSelfProfile');
    this.inputSelfName = document.getElementById('inputSelfName');
    this.inputSelfPassword = document.getElementById('inputSelfPassword');
    this.inputSelfCurrentPassword = document.getElementById('inputSelfCurrentPassword');
    this.selfProfileStatusMsg = document.getElementById('selfProfileStatusMsg');
    this.selfShiftHistoryList = document.getElementById('selfShiftHistoryList');
    this.totalHoursWorkedBadge = document.getElementById('totalHoursWorkedBadge');
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
    this.allStaffShiftsList = document.getElementById('allStaffShiftsList');

    // Reset Password Modal
    this.resetPasswordModal = document.getElementById('resetPasswordModal');
    this.btnCloseResetPassword = document.getElementById('btnCloseResetPassword');
    this.formResetCounselorPassword = document.getElementById('formResetCounselorPassword');
    this.resetTargetIdHidden = document.getElementById('resetTargetIdHidden');
    this.resetTargetName = document.getElementById('resetTargetName');
    this.resetTargetStaffId = document.getElementById('resetTargetStaffId');
    this.inputResetNewPassword = document.getElementById('inputResetNewPassword');
    this.btnShuffleResetPassword = document.getElementById('btnShuffleResetPassword');
    this.resetResultCard = document.getElementById('resetResultCard');
    this.resetResultPre = document.getElementById('resetResultPre');
    this.btnCopyResetCredentials = document.getElementById('btnCopyResetCredentials');

    // Sanctuary Charter & Privacy Modal
    this.privacyModal = document.getElementById('privacyModal');
    this.btnStaffOpenPrivacy = document.getElementById('btnStaffOpenPrivacy');
    this.linkStaffLoginPrivacy = document.getElementById('linkStaffLoginPrivacy');
    this.btnClosePrivacy = document.getElementById('btnClosePrivacy');
    this.btnDismissPrivacyModal = document.getElementById('btnDismissPrivacyModal');
    this.tabBtnDisclaimer = document.getElementById('tabBtnDisclaimer');
    this.tabBtnPrivacy = document.getElementById('tabBtnPrivacy');
    this.panelDisclaimer = document.getElementById('panelDisclaimer');
    this.panelPrivacy = document.getElementById('panelPrivacy');

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
    this.btnDeskReviews = document.getElementById('btnDeskReviews');
    this.btnDeskSupervisor = document.getElementById('btnDeskSupervisor');
    this.deskTriagePane = document.getElementById('deskTriagePane');
    this.deskConfessionsPane = document.getElementById('deskConfessionsPane');
    this.deskReviewsPane = document.getElementById('deskReviewsPane');
    this.deskSupervisorPane = document.getElementById('deskSupervisorPane');
    this.badgePendingConfessions = document.getElementById('badgePendingConfessions');
    this.badgePendingReviews = document.getElementById('badgePendingReviews');

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
    this.btnOpenFollowUpModal = document.getElementById('btnOpenFollowUpModal');
    this.counselorMessagesList = document.getElementById('counselorMessagesList');
    this.counselorInput = document.getElementById('counselorTextInput');
    this.btnCounselorSend = document.getElementById('btnCounselorSend');

    // Follow-Up & Passkey Modal Elements
    this.followUpModal = document.getElementById('followUpModal');
    this.btnCloseFollowUpModal = document.getElementById('btnCloseFollowUpModal');
    this.formScheduleFollowUp = document.getElementById('formScheduleFollowUp');
    this.followUpReturnTime = document.getElementById('followUpReturnTime');
    this.followUpSafetyPlan = document.getElementById('followUpSafetyPlan');
    this.followUpHandoffNote = document.getElementById('followUpHandoffNote');
    this.followUpResultCard = document.getElementById('followUpResultCard');
    this.followUpPasskeyDisplay = document.getElementById('followUpPasskeyDisplay');
    this.btnCopyFollowUpPasskey = document.getElementById('btnCopyFollowUpPasskey');

    // Group Room Assignment Controls
    this.selectGroupRoom = document.getElementById('selectGroupRoom');
    this.inputNewRoomTitle = document.getElementById('inputNewRoomTitle');
    this.btnCreateAndInviteRoom = document.getElementById('btnCreateAndInviteRoom');
    this.btnInviteSelectedRoom = document.getElementById('btnInviteSelectedRoom');

    // Confession Moderation Desk
    this.pendingConfessionsList = document.getElementById('pendingConfessionsList');
    this.btnResetLocalData = document.getElementById('btnResetLocalData');

    // Reviews Moderation Desk
    this.pendingReviewsList = document.getElementById('pendingReviewsList');

    // Crisis Helplines Modal (Staff Console)
    this.btnStaffHelplines = document.getElementById('btnStaffHelplines');
    this.helplinesModal = document.getElementById('helplinesModal');
    this.btnCloseHelplines = document.getElementById('btnCloseHelplines');
    this.helplinesModalContainer = document.getElementById('helplinesModalContainer');
  }

  bindEvents() {
    // Login Form
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Profile Modal Events
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
    if (this.formEditSelfProfile) {
      this.formEditSelfProfile.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveSelfProfile();
      });
    }
    if (this.btnCloseResetPassword) {
      this.btnCloseResetPassword.addEventListener('click', () => this.closeResetPasswordModal());
    }
    if (this.resetPasswordModal) {
      this.resetPasswordModal.addEventListener('click', (e) => {
        if (e.target === this.resetPasswordModal) this.closeResetPasswordModal();
      });
    }
    if (this.btnShuffleResetPassword && this.inputResetNewPassword) {
      this.btnShuffleResetPassword.addEventListener('click', () => {
        this.inputResetNewPassword.value = auth.generateRandomPassword();
      });
    }
    if (this.formResetCounselorPassword) {
      this.formResetCounselorPassword.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleResetCounselorPasswordSubmit();
      });
    }
    if (this.btnCopyResetCredentials) {
      this.btnCopyResetCredentials.addEventListener('click', () => this.handleCopyResetCredentials());
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

    // Sanctuary Charter & Clinical Disclaimer Modal
    const switchStaffPolicyTab = (target) => {
      if (target === 'disclaimer') {
        if (this.tabBtnDisclaimer) {
          this.tabBtnDisclaimer.classList.add('active');
          this.tabBtnDisclaimer.setAttribute('aria-selected', 'true');
        }
        if (this.tabBtnPrivacy) {
          this.tabBtnPrivacy.classList.remove('active');
          this.tabBtnPrivacy.setAttribute('aria-selected', 'false');
        }
        if (this.panelDisclaimer) this.panelDisclaimer.classList.add('active');
        if (this.panelPrivacy) this.panelPrivacy.classList.remove('active');
      } else {
        if (this.tabBtnDisclaimer) {
          this.tabBtnDisclaimer.classList.remove('active');
          this.tabBtnDisclaimer.setAttribute('aria-selected', 'false');
        }
        if (this.tabBtnPrivacy) {
          this.tabBtnPrivacy.classList.add('active');
          this.tabBtnPrivacy.setAttribute('aria-selected', 'true');
        }
        if (this.panelDisclaimer) this.panelDisclaimer.classList.remove('active');
        if (this.panelPrivacy) this.panelPrivacy.classList.add('active');
      }
    };

    if (this.tabBtnDisclaimer) {
      this.tabBtnDisclaimer.addEventListener('click', () => switchStaffPolicyTab('disclaimer'));
    }
    if (this.tabBtnPrivacy) {
      this.tabBtnPrivacy.addEventListener('click', () => switchStaffPolicyTab('privacy'));
    }

    const openPrivacyModal = (tab = 'disclaimer') => {
      switchStaffPolicyTab(tab);
      if (this.privacyModal) {
        this.privacyModal.style.display = 'flex';
        this.privacyModal.classList.add('open');
      }
    };

    const closePrivacyModal = () => {
      if (this.privacyModal) {
        this.privacyModal.style.display = 'none';
        this.privacyModal.classList.remove('open');
      }
    };

    if (this.btnStaffOpenPrivacy) {
      this.btnStaffOpenPrivacy.addEventListener('click', () => openPrivacyModal('disclaimer'));
    }
    if (this.linkStaffLoginPrivacy) {
      this.linkStaffLoginPrivacy.addEventListener('click', (e) => {
        e.preventDefault();
        openPrivacyModal('disclaimer');
      });
    }
    if (this.btnClosePrivacy) {
      this.btnClosePrivacy.addEventListener('click', () => closePrivacyModal());
    }
    if (this.btnDismissPrivacyModal) {
      this.btnDismissPrivacyModal.addEventListener('click', () => closePrivacyModal());
    }
    if (this.privacyModal) {
      this.privacyModal.addEventListener('click', (e) => {
        if (e.target === this.privacyModal) closePrivacyModal();
      });
    }

    // Instant Staff Revocation Event Listener (Real-Time Kickout)
    window.addEventListener('tumaini:staff-revoked', (e) => {
      const revokedId = (e.detail?.staffId || '').toUpperCase();
      const currentSession = auth.getSession();
      if (currentSession && currentSession.staffId.toUpperCase() === revokedId) {
        auth.logout();
        this.stopShiftTimer();
        this.activeIntake = null;
        this.closeProfileModal();
        this.closeResetPasswordModal();
        this.showAuth();
        this.showAuthNotice('Your operator account has been deactivated by the supervisor. Your session has ended immediately.', true);
        alert('Your operator account has been deactivated by the supervisor. You have been logged out.');
      } else if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
        this.renderAllStaffShifts();
      }
    });

    // Profile update sync across tabs
    window.addEventListener('tumaini:staff-profile-updated', (e) => {
      const updatedId = (e.detail?.staffId || '').toUpperCase();
      const currentSession = auth.getSession();
      if (currentSession && currentSession.staffId.toUpperCase() === updatedId) {
        if (e.detail.name) currentSession.name = e.detail.name;
        this.syncDutyStrip();
      }
      if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
        this.renderAllStaffShifts();
      }
    });

    // Password reset sync across tabs
    window.addEventListener('tumaini:staff-password-reset', (e) => {
      if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
      }
    });

    // Multi-Device Shift Synchronization
    window.addEventListener('tumaini:shift-sync', (e) => {
      const session = auth.getSession();
      if (session && e.detail && e.detail.staffId && session.staffId.toUpperCase() === e.detail.staffId.toUpperCase()) {
        session.isOnDuty = !!e.detail.isOnDuty;
        session.shiftStartedAt = e.detail.shiftStartedAt || null;
        this.syncDutyStrip();
      }
      if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
        this.renderAllStaffShifts();
      }
    });

    // Duty Strip
    if (this.btnClockIn) this.btnClockIn.addEventListener('click', () => this.handleClockIn());
    if (this.btnClockOut) this.btnClockOut.addEventListener('click', () => this.handleClockOut());
    if (this.btnLogout) this.btnLogout.addEventListener('click', () => this.handleLogout());

    // Desk Switching
    if (this.btnDeskTriage) this.btnDeskTriage.addEventListener('click', () => this.switchDesk('triage'));
    if (this.btnDeskConfessions) this.btnDeskConfessions.addEventListener('click', () => this.switchDesk('confessions'));
    if (this.btnDeskReviews) this.btnDeskReviews.addEventListener('click', () => this.switchDesk('reviews'));
    if (this.btnDeskSupervisor) this.btnDeskSupervisor.addEventListener('click', () => this.switchDesk('supervisor'));

    // Follow-Up & Passkey Modal Events
    if (this.btnOpenFollowUpModal) {
      this.btnOpenFollowUpModal.addEventListener('click', (e) => {
        e.preventDefault();
        this.openFollowUpModal();
      });
    }
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#btnOpenFollowUpModal');
      if (btn) {
        e.preventDefault();
        this.openFollowUpModal();
      }
    });
    if (this.btnCloseFollowUpModal) {
      this.btnCloseFollowUpModal.addEventListener('click', () => this.closeFollowUpModal());
    }
    if (this.formScheduleFollowUp) {
      this.formScheduleFollowUp.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleScheduleFollowUp();
      });
    }
    if (this.btnCopyFollowUpPasskey) {
      this.btnCopyFollowUpPasskey.addEventListener('click', () => this.handleCopyFollowUpPasskey());
    }
    if (this.followUpModal) {
      this.followUpModal.addEventListener('click', (e) => {
        if (e.target === this.followUpModal) this.closeFollowUpModal();
      });
    }

    // Helplines Modal Events (Staff Console)
    if (this.btnStaffHelplines && this.helplinesModal) {
      this.btnStaffHelplines.addEventListener('click', () => {
        if (this.helplinesModalContainer) {
          renderHelplineCards(this.helplinesModalContainer);
        }
        this.helplinesModal.classList.add('open', 'active');
        this.helplinesModal.style.display = 'flex';
      });
    }
    if (this.btnCloseHelplines && this.helplinesModal) {
      this.btnCloseHelplines.addEventListener('click', () => {
        this.helplinesModal.classList.remove('open', 'active');
        this.helplinesModal.style.display = 'none';
      });
    }
    if (this.helplinesModal) {
      this.helplinesModal.addEventListener('click', (e) => {
        if (e.target === this.helplinesModal) {
          this.helplinesModal.classList.remove('open', 'active');
          this.helplinesModal.style.display = 'none';
        }
      });
    }

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
          this.activeIntake = null;
          store.setActiveStaffIntake(null);
          store.updateIntakeStatus(intakeId, 'resolved');
          bus.broadcast('INTAKE_STATUS', { intakeId, status: 'resolved' });
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

    // Community Review Moderation Actions
    if (this.pendingReviewsList) {
      this.pendingReviewsList.addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.btn-approve-review');
        const rejectBtn = e.target.closest('.btn-reject-review');
        const session = auth.getSession();
        const staffId = session?.staffId || 'STAFF';
        if (approveBtn) {
          const reviewId = approveBtn.dataset.reviewId;
          store.approveReview(reviewId, staffId);
          this.renderReviewsDesk();
        } else if (rejectBtn) {
          const reviewId = rejectBtn.dataset.reviewId;
          store.rejectReview(reviewId, staffId);
          this.renderReviewsDesk();
        }
      });
    }
  }

  initSubscriptions() {
    store.subscribe(() => {
      this.renderQueue();
      this.renderRoomSelectDropdown();
      this.renderConfessionsDesk();
      this.renderReviewsDesk();

      if (this.activeIntake) {
        const updated = store.intakes.find(i => i.id === this.activeIntake.id);
        if (updated) {
          if (updated.status === 'resolved') {
            this.activeIntake = null;
            store.setActiveStaffIntake(null);
            this.renderWorkspace();
          } else {
            this.activeIntake = updated;
            this.renderMessages();
            this.syncWorkspaceHeader();
          }
        }
        // If not in memory during an async background sync, keep active intake
      } else {
        const saved = store.getActiveStaffIntake();
        if (saved && saved.status !== 'resolved') {
          this.selectCase(saved);
        }
      }
    });

    auth.subscribe(() => {
      this.syncDutyStrip();
    });

    // Realtime Supabase Reviews Subscription
    if (supabase && typeof supabase.subscribeToReviews === 'function') {
      supabase.subscribeToReviews(
        () => this.renderReviewsDesk(),
        () => this.renderReviewsDesk()
      );
    }
  }

  checkSession() {
    if (auth.isAuthenticated()) {
      this.showConsole();
      this.syncDutyStrip();
      this.renderQueue();
      this.renderRoomSelectDropdown();
      this.renderConfessionsDesk();
      this.renderReviewsDesk();
      if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
        this.renderAllStaffShifts();
      }

      // Check persistent active intake
      const active = store.getActiveStaffIntake();
      if (active && active.status !== 'resolved') {
        this.selectCase(active);
      } else {
        this.renderWorkspace();
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
    if (this.btnDeskSupervisor) {
      this.btnDeskSupervisor.style.display = auth.isSupervisor() ? 'inline-flex' : 'none';
    }
  }

  switchDesk(desk) {
    if (this.btnDeskTriage) this.btnDeskTriage.classList.remove('active');
    if (this.btnDeskConfessions) this.btnDeskConfessions.classList.remove('active');
    if (this.btnDeskReviews) this.btnDeskReviews.classList.remove('active');
    if (this.btnDeskSupervisor) this.btnDeskSupervisor.classList.remove('active');

    if (this.deskTriagePane) {
      this.deskTriagePane.classList.remove('active');
      this.deskTriagePane.style.display = 'none';
    }
    if (this.deskConfessionsPane) {
      this.deskConfessionsPane.classList.remove('active');
      this.deskConfessionsPane.style.display = 'none';
    }
    if (this.deskReviewsPane) {
      this.deskReviewsPane.classList.remove('active');
      this.deskReviewsPane.style.display = 'none';
    }
    if (this.deskSupervisorPane) {
      this.deskSupervisorPane.classList.remove('active');
      this.deskSupervisorPane.style.display = 'none';
    }

    if (desk === 'confessions') {
      if (this.btnDeskConfessions) this.btnDeskConfessions.classList.add('active');
      if (this.deskConfessionsPane) {
        this.deskConfessionsPane.classList.add('active');
        this.deskConfessionsPane.style.display = 'block';
      }
      this.renderConfessionsDesk();
    } else if (desk === 'reviews') {
      if (this.btnDeskReviews) this.btnDeskReviews.classList.add('active');
      if (this.deskReviewsPane) {
        this.deskReviewsPane.classList.add('active');
        this.deskReviewsPane.style.display = 'block';
      }
      this.renderReviewsDesk();
    } else if (desk === 'supervisor') {
      if (!auth.isSupervisor()) {
        this.switchDesk('triage');
        return;
      }
      if (this.btnDeskSupervisor) this.btnDeskSupervisor.classList.add('active');
      if (this.deskSupervisorPane) {
        this.deskSupervisorPane.classList.add('active');
        this.deskSupervisorPane.style.display = 'block';
      }
      if (this.genCounselorPassword && !this.genCounselorPassword.value) {
        this.genCounselorPassword.value = auth.generateRandomPassword();
      }
      this.renderCounselorsRoster();
      this.renderAllStaffShifts();
    } else {
      if (this.btnDeskTriage) this.btnDeskTriage.classList.add('active');
      if (this.deskTriagePane) {
        this.deskTriagePane.classList.add('active');
        this.deskTriagePane.style.display = 'block';
      }
      this.renderQueue();
      this.renderWorkspace();
    }
  }

  async handleResetLocalData() {
    const ok = await this.showConfirm(
      'Clear Local Cache',
      'Clear local queue and session cache? This will wipe cached intakes and re-sync fresh from Supabase.',
      'Clear & Re-sync',
      false
    );
    if (ok) {
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
      if (auth.isSupervisor()) {
        this.renderCounselorsRoster();
        this.renderAllStaffShifts();
      }

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

    if (auth.isRevoked(session.staffId)) {
      alert('Your account has been revoked by the supervisor.');
      this.handleLogout();
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

    // Populate self profile edit inputs
    if (this.inputSelfName) {
      this.inputSelfName.value = session.name || '';
    }
    if (this.inputSelfPassword) {
      this.inputSelfPassword.value = '';
    }
    if (this.inputSelfCurrentPassword) {
      this.inputSelfCurrentPassword.value = session.authSecret || '';
    }
    if (this.selfProfileStatusMsg) {
      this.selfProfileStatusMsg.style.display = 'none';
      this.selfProfileStatusMsg.textContent = '';
    }

    // Render self shift attendance history
    this.renderSelfShiftHistory();

    this.staffProfileModal.classList.add('open');
    this.staffProfileModal.classList.add('active');
  }

  closeProfileModal() {
    if (!this.staffProfileModal) return;
    this.staffProfileModal.classList.remove('open');
    this.staffProfileModal.classList.remove('active');
    if (this.selfProfileStatusMsg) {
      this.selfProfileStatusMsg.style.display = 'none';
    }
  }

  async handleSaveSelfProfile() {
    const session = auth.getSession();
    if (!session) return;
    if (auth.isRevoked(session.staffId)) {
      alert('Your account has been revoked.');
      this.handleLogout();
      return;
    }

    const newName = this.inputSelfName ? this.inputSelfName.value.trim() : '';
    const newPass = this.inputSelfPassword ? this.inputSelfPassword.value.trim() : '';
    const currentPass = this.inputSelfCurrentPassword ? this.inputSelfCurrentPassword.value.trim() : (session.authSecret || '');

    if (!newName) {
      if (this.selfProfileStatusMsg) {
        this.selfProfileStatusMsg.textContent = 'Display name cannot be empty.';
        this.selfProfileStatusMsg.style.color = '#ef4444';
        this.selfProfileStatusMsg.style.display = 'block';
      }
      return;
    }

    if (newPass && newPass.length < 4) {
      if (this.selfProfileStatusMsg) {
        this.selfProfileStatusMsg.textContent = 'New password must be at least 4 characters long.';
        this.selfProfileStatusMsg.style.color = '#ef4444';
        this.selfProfileStatusMsg.style.display = 'block';
      }
      return;
    }

    if (!currentPass) {
      if (this.selfProfileStatusMsg) {
        this.selfProfileStatusMsg.textContent = 'Current password is required to save profile changes.';
        this.selfProfileStatusMsg.style.color = '#ef4444';
        this.selfProfileStatusMsg.style.display = 'block';
      }
      return;
    }

    if (this.selfProfileStatusMsg) {
      this.selfProfileStatusMsg.textContent = 'Saving changes...';
      this.selfProfileStatusMsg.style.color = 'var(--text-muted)';
      this.selfProfileStatusMsg.style.display = 'block';
    }

    const res = await auth.updateProfile({ name: newName, password: newPass, currentPassword: currentPass });
    if (res.success) {
      if (this.profileNameDisplay) this.profileNameDisplay.textContent = newName;
      if (this.staffNameDisplay) this.staffNameDisplay.textContent = newName;
      if (this.inputSelfPassword) this.inputSelfPassword.value = '';
      if (this.inputSelfCurrentPassword) this.inputSelfCurrentPassword.value = newPass || currentPass;
      if (this.selfProfileStatusMsg) {
        this.selfProfileStatusMsg.textContent = 'Profile updated successfully!';
        this.selfProfileStatusMsg.style.color = '#10b981';
        this.selfProfileStatusMsg.style.display = 'block';
        setTimeout(() => {
          if (this.selfProfileStatusMsg) this.selfProfileStatusMsg.style.display = 'none';
        }, 3500);
      }
      this.syncDutyStrip();
    } else {
      if (this.selfProfileStatusMsg) {
        this.selfProfileStatusMsg.textContent = res.error || 'Failed to update profile.';
        this.selfProfileStatusMsg.style.color = '#ef4444';
        this.selfProfileStatusMsg.style.display = 'block';
      }
    }
  }

  renderSelfShiftHistory() {
    if (!this.selfShiftHistoryList) return;
    const session = auth.getSession();
    if (!session) return;

    const shifts = auth.getStaffShiftHistory(session.staffId);
    const total = auth.getTotalHoursWorked(session.staffId);

    if (this.totalHoursWorkedBadge) {
      this.totalHoursWorkedBadge.textContent = total.text;
    }

    this.selfShiftHistoryList.innerHTML = '';
    if (shifts.length === 0) {
      this.selfShiftHistoryList.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 12px 0; text-align: center;">
          No shift history recorded yet. Clock in using the top bar to record your clinical duty hours.
        </div>
      `;
      return;
    }

    shifts.slice(0, 10).forEach(shift => {
      const inDate = shift.clockInTime ? new Date(shift.clockInTime) : null;
      const inTimeStr = inDate ? inDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
      const inDateStr = inDate ? inDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';

      let outStr = 'Active On Duty';
      let durationStr = 'In Progress';
      let statusColor = '#10b981';

      if (shift.clockOutTime) {
        const outDate = new Date(shift.clockOutTime);
        outStr = outDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statusColor = 'var(--text-secondary)';
        const mins = shift.durationMinutes || Math.max(1, Math.round((shift.clockOutTime - shift.clockInTime) / 60000));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        durationStr = `${h}h ${m}m`;
      }

      const item = document.createElement('div');
      item.className = 'shift-history-item';
      item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 12px;';
      item.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--text-primary);">${inDateStr}</div>
          <div style="font-size: 11px; color: var(--text-muted);">In: ${inTimeStr} &bull; Out: ${outStr}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: ${statusColor}; font-family: monospace;">${durationStr}</div>
          <div style="font-size: 10.5px; color: var(--text-muted);">${shift.clockOutTime ? 'Completed' : 'Current'}</div>
        </div>
      `;
      this.selfShiftHistoryList.appendChild(item);
    });
  }

  renderAllStaffShifts() {
    if (!this.allStaffShiftsList) return;
    const allShifts = auth.getAllShiftHistory();
    this.allStaffShiftsList.innerHTML = '';

    if (allShifts.length === 0) {
      this.allStaffShiftsList.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 8px 0; text-align: center;">
          No staff shifts recorded yet.
        </div>
      `;
      return;
    }

    allShifts.slice(0, 20).forEach(shift => {
      const inDate = shift.clockInTime ? new Date(shift.clockInTime) : null;
      const inTimeStr = inDate ? inDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
      const inDateStr = inDate ? inDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

      let outStr = 'Active On Duty';
      let durationStr = 'In Progress';
      let statusColor = '#10b981';

      if (shift.clockOutTime) {
        const outDate = new Date(shift.clockOutTime);
        outStr = outDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statusColor = 'var(--text-secondary)';
        const mins = shift.durationMinutes || Math.max(1, Math.round((shift.clockOutTime - shift.clockInTime) / 60000));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        durationStr = `${h}h ${m}m`;
      }

      const item = document.createElement('div');
      item.className = 'all-shift-history-item';
      item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 11.5px;';
      item.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--text-primary);">
            <span>${this.escapeHtml(shift.name || shift.staffId)}</span>
            <span style="font-size: 10.5px; color: var(--brand-eucalyptus-dark); font-family: monospace; margin-left: 4px;">(${shift.staffId})</span>
          </div>
          <div style="font-size: 10.5px; color: var(--text-muted);">${inDateStr} &bull; In: ${inTimeStr} &bull; Out: ${outStr}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: ${statusColor}; font-family: monospace; font-size: 11px;">${durationStr}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${shift.clockOutTime ? 'Closed' : 'Active'}</div>
        </div>
      `;
      this.allStaffShiftsList.appendChild(item);
    });
  }

  openResetPasswordModal(counselor) {
    if (!this.resetPasswordModal || !counselor) return;
    if (this.resetTargetIdHidden) this.resetTargetIdHidden.value = counselor.staffId;
    if (this.resetTargetName) this.resetTargetName.textContent = counselor.name;
    if (this.resetTargetStaffId) this.resetTargetStaffId.textContent = counselor.staffId;
    if (this.inputResetNewPassword) this.inputResetNewPassword.value = auth.generateRandomPassword();
    if (this.resetResultCard) this.resetResultCard.style.display = 'none';

    this.resetPasswordModal.classList.add('open');
    this.resetPasswordModal.classList.add('active');
  }

  closeResetPasswordModal() {
    if (!this.resetPasswordModal) return;
    this.resetPasswordModal.classList.remove('open');
    this.resetPasswordModal.classList.remove('active');
    if (this.resetResultCard) this.resetResultCard.style.display = 'none';
  }

  async handleResetCounselorPasswordSubmit() {
    const targetStaffId = this.resetTargetIdHidden ? this.resetTargetIdHidden.value : '';
    const newPassword = this.inputResetNewPassword ? this.inputResetNewPassword.value.trim() : '';
    const counselorName = this.resetTargetName ? this.resetTargetName.textContent : targetStaffId;

    if (!targetStaffId) {
      alert('Missing target counselor identifier.');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      alert('Password must be at least 4 characters long.');
      return;
    }

    const res = await auth.resetCounselorPassword(targetStaffId, newPassword);
    if (res.success) {
      if (this.resetResultPre && this.resetResultCard) {
        const text = [
          '==============================',
          'UPDATED COUNSELOR CREDENTIALS',
          '==============================',
          `Counselor: ${counselorName}`,
          `Operator ID: ${targetStaffId}`,
          `New Password: ${newPassword}`,
          'Portal Login: https://tumaini-zeta.vercel.app/staff',
          '==============================',
          'Securely transmit these new credentials to the counselor.'
        ].join('\n');

        this.resetResultPre.textContent = text;
        this.resetResultCard.style.display = 'block';
      }
    } else {
      alert(res.error || 'Failed to reset password for counselor.');
    }
  }

  handleCopyResetCredentials() {
    if (!this.resetResultPre) return;
    const text = this.resetResultPre.textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert('New credentials copied to clipboard!');
    }).catch(err => {
      console.warn('Clipboard write failed', err);
      alert('Copied credentials:\n\n' + text);
    });
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
      item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; margin-bottom: 6px;';
      item.innerHTML = `
        <div>
          <strong style="color: var(--brand-eucalyptus-dark); font-family: monospace;">${c.staffId}</strong>
          <span style="margin: 0 4px; color: var(--text-muted);">&bull;</span>
          <span style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(c.name)}</span>
          <span style="font-size: 11.5px; color: var(--text-muted); margin-left: 6px;">(${this.escapeHtml(c.role)})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="btn-reset-counselor-pass" data-staff-id="${c.staffId}" style="background: none; border: 1px solid var(--border-medium); color: var(--brand-eucalyptus-dark); border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-weight: 500;">
            Reset Password
          </button>
          <button type="button" class="btn-revoke-counselor" data-staff-id="${c.staffId}" style="background: none; border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-weight: 500;">
            Revoke
          </button>
        </div>
      `;

      item.querySelector('.btn-reset-counselor-pass').addEventListener('click', () => {
        this.openResetPasswordModal(c);
      });

      item.querySelector('.btn-revoke-counselor').addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.staffId;
        const ok = await this.showConfirm(
          'Revoke Counselor Access',
          `Revoke access for counselor ${c.name} (${id})? This will immediately log them out across all devices and terminate their access.`,
          'Revoke Access',
          true
        );
        if (ok) {
          await auth.deleteCounselor(id);
          await this.renderCounselorsRoster();
          this.renderAllStaffShifts();
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

  showConfirm(title, message, confirmText = 'Confirm', isDanger = false) {
    return new Promise((resolve) => {
      let modal = document.getElementById('tumainiConfirmModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tumainiConfirmModal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="modal-card" style="max-width: 440px; padding: 24px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); border: 1px solid var(--border-default); background: #ffffff;">
          <h3 style="margin: 0 0 10px; font-size: 17px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading, inherit);">${this.escapeHtml(title)}</h3>
          <p style="margin: 0 0 20px; font-size: 13.5px; line-height: 1.5; color: var(--text-secondary);">${this.escapeHtml(message)}</p>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="confirmModalCancelBtn" class="btn btn-outline" style="padding: 7px 16px; font-size: 13px; border-radius: 6px; cursor: pointer;">
              Cancel
            </button>
            <button type="button" id="confirmModalOkBtn" class="btn" style="padding: 7px 18px; font-size: 13px; border-radius: 6px; cursor: pointer; font-weight: 600; ${isDanger ? 'background: #ef4444; border-color: #ef4444; color: #fff;' : 'background: var(--brand-eucalyptus, #2c4e43); border-color: var(--brand-eucalyptus, #2c4e43); color: #fff;'}">
              ${this.escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      `;

      modal.classList.add('open', 'active');
      modal.style.display = 'flex';

      const cleanup = (result) => {
        modal.classList.remove('open', 'active');
        modal.style.display = 'none';
        resolve(result);
      };

      modal.querySelector('#confirmModalCancelBtn').addEventListener('click', () => cleanup(false), { once: true });
      modal.querySelector('#confirmModalOkBtn').addEventListener('click', () => cleanup(true), { once: true });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) cleanup(false);
      }, { once: true });
    });
  }

  handleClockIn() {
    const session = auth.getSession();
    if (!session) {
      this.showAuth();
      return;
    }
    if (auth.isRevoked(session.staffId)) {
      alert('Your operator account has been deactivated by the supervisor.');
      this.handleLogout();
      return;
    }
    auth.clockIn();
    this.syncDutyStrip();
  }

  async handleClockOut() {
    const ok = await this.showConfirm(
      'Clock Out of Shift',
      'Clock out of your shift? Active cases will need handover.',
      'Clock Out',
      false
    );
    if (ok) {
      auth.clockOut();
      this.syncDutyStrip();
    }
  }

  async handleLogout() {
    if (auth.isOnDuty()) {
      const ok = await this.showConfirm(
        'Clock Out & Sign Out',
        'You are clocked in. Logging out will end your shift. Continue?',
        'End Shift & Sign Out',
        true
      );
      if (!ok) return;
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
          <span style="font-size: 11px; color: ${(item.status === 'in_session' || item.status === 'active') ? '#52b788' : (item.status === 'follow_up' ? '#3b82f6' : '#94a3b8')};">
            ${(item.status === 'in_session' || item.status === 'active') ? `• In Session (${this.escapeHtml(item.counselorName || 'Assigned')})` : (item.status === 'follow_up' ? `• Follow-Up (${this.escapeHtml(item.nextCheckIn || 'Saved')})` : '• Waiting for Counselor')}
          </span>
          <button class="btn-claim-case" type="button">
            ${(item.status === 'in_session' || item.status === 'active' || item.status === 'follow_up') ? 'Open Desk' : 'Accept Case'}
          </button>
        </div>
      `;

      this.queueList.appendChild(card);
    });
  }

  claimCase(item) {
    const session = auth.getSession();
    if (!session) {
      this.showAuth();
      return;
    }
    if (auth.isRevoked(session.staffId)) {
      alert('Your operator account has been deactivated by the supervisor.');
      this.handleLogout();
      return;
    }
    if (!session.isOnDuty) {
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
    if (!session) {
      this.showAuth();
      return;
    }
    if (auth.isRevoked(session.staffId)) {
      alert('Your operator account has been deactivated by the supervisor.');
      this.handleLogout();
      return;
    }
    if (!session.isOnDuty) {
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

  // --- Reviews Moderation Desk ---
  renderReviewsDesk() {
    const pending = store.getPendingReviews();
    if (this.badgePendingReviews) {
      this.badgePendingReviews.textContent = pending.length;
    }

    if (!this.pendingReviewsList) return;
    this.pendingReviewsList.innerHTML = '';

    const syncStatus = (supabase && !supabase.reviewsTableDisabled)
      ? '<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #e8f2ee; color: #2c4e43; border: 1px solid #bcd5cb; padding: 2px 8px; border-radius: 999px;">● Cloud Sync Active</span>'
      : '<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #f4f6f3; color: var(--text-secondary); border: 1px solid var(--border-subtle); padding: 2px 8px; border-radius: 999px;">○ Local Storage Mode</span>';

    const headerBar = document.createElement('div');
    headerBar.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #ffffff; border: 1px solid var(--border-default); border-radius: 8px; margin-bottom: 12px;';
    headerBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Reviews Storage:</span>
        ${syncStatus}
      </div>
      <button type="button" id="btnTestCloudReviews" class="btn-secondary" style="font-size: 11px; padding: 4px 10px;">
        ${(supabase && !supabase.reviewsTableDisabled) ? 'Test Connection' : 'Enable Cloud Sync'}
      </button>
    `;
    this.pendingReviewsList.appendChild(headerBar);

    const btnTest = headerBar.querySelector('#btnTestCloudReviews');
    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        btnTest.disabled = true;
        btnTest.textContent = 'Testing...';
        const res = await supabase.checkOrEnableReviewsCloudSync();
        btnTest.disabled = false;
        if (res.success) {
          alert('Success! Supabase public.reviews table verified and cloud sync is now enabled.');
          this.renderReviewsDesk();
        } else {
          alert('Could not connect to cloud reviews: ' + res.error + '\n\nNote: If you have not created the reviews table yet, paste supabase/migrations/002_case_continuity_and_reviews.sql into your Supabase SQL editor.');
          this.renderReviewsDesk();
        }
      });
    }

    if (pending.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.style.cssText = 'text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;';
      emptyCard.textContent = 'All clear. Zero pending seeker reviews awaiting moderation.';
      this.pendingReviewsList.appendChild(emptyCard);
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

      const stars = '★'.repeat(item.rating || 5) + '☆'.repeat(5 - (item.rating || 5));

      card.innerHTML = `
        <div class="pending-confession-header">
          <span style="font-weight: 700; color: var(--brand-eucalyptus-dark); font-size: 13.5px;">${this.escapeHtml(item.alias)}</span>
          <span style="color: #f59e0b; font-size: 14px; letter-spacing: 2px;">${stars}</span>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${timeStr}</span>
        </div>
        <div class="pending-confession-text" style="font-size: 13.5px; line-height: 1.5; color: var(--text-primary); margin: 8px 0;">
          "${this.escapeHtml(item.text)}"
        </div>
        <div class="pending-confession-actions">
          <button class="btn-reject btn-reject-review" type="button" data-review-id="${item.id}">
            Decline
          </button>
          <button class="btn-approve btn-approve-review" type="button" data-review-id="${item.id}">
            Approve & Publish to Community Reviews
          </button>
        </div>
      `;

      this.pendingReviewsList.appendChild(card);
    });
  }

  // --- Follow-Up & Passkey Case Continuity ---
  openFollowUpModal() {
    if (!this.activeIntake) {
      const active = store.getActiveStaffIntake();
      if (active) {
        this.activeIntake = active;
      } else {
        alert('Please select or accept an active consultation first.');
        return;
      }
    }
    const modal = this.followUpModal || document.getElementById('followUpModal');
    if (modal) {
      const returnTimeInput = this.followUpReturnTime || document.getElementById('followUpReturnTime');
      const safetyPlanInput = this.followUpSafetyPlan || document.getElementById('followUpSafetyPlan');
      const handoffNoteInput = this.followUpHandoffNote || document.getElementById('followUpHandoffNote');
      const resultCard = this.followUpResultCard || document.getElementById('followUpResultCard');

      if (returnTimeInput) returnTimeInput.value = this.activeIntake.nextCheckIn || '';
      if (safetyPlanInput) safetyPlanInput.value = this.activeIntake.safetyPlan || '';
      if (handoffNoteInput) handoffNoteInput.value = this.activeIntake.handoffNote || '';
      if (resultCard) resultCard.style.display = 'none';

      modal.classList.add('open');
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  closeFollowUpModal() {
    const modal = this.followUpModal || document.getElementById('followUpModal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  async handleScheduleFollowUp() {
    if (!this.activeIntake) {
      const active = store.getActiveStaffIntake();
      if (active) this.activeIntake = active;
      else {
        alert('Please select an active consultation first.');
        return;
      }
    }
    const session = auth.getSession();
    if (!session || !session.isOnDuty) {
      alert('You must Clock In on shift (top bar) before scheduling follow-up.');
      return;
    }

    const returnTime = (this.followUpReturnTime || document.getElementById('followUpReturnTime'))?.value?.trim() || '';
    const safetyPlan = (this.followUpSafetyPlan || document.getElementById('followUpSafetyPlan'))?.value?.trim() || '';
    const handoffNote = (this.followUpHandoffNote || document.getElementById('followUpHandoffNote'))?.value?.trim() || '';

    // Generate memorable passkey: TMN- + 4 uppercase alphanumeric characters
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const passkey = `TMN-${code}`;

    // Compute SHA-256 hash using Web Crypto API
    let passkeyHash = null;
    try {
      const enc = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(passkey));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      passkeyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('Web Crypto hash fallback', e);
      passkeyHash = passkey;
    }

    // Save to store & Supabase
    store.setCaseFollowUp({
      intakeId: this.activeIntake.id,
      passkeyHash,
      safetyPlan,
      handoffNote,
      nextCheckIn: returnTime
    });

    // Post to chat stream for seeker
    const planText = safetyPlan ? `\nTake-Home Care & Safety Plan: ${safetyPlan}` : '';
    const returnText = returnTime ? `\nAgreed Return Time: ${returnTime}` : '';

    store.addIntakeMessage({
      intakeId: this.activeIntake.id,
      sender: 'system',
      senderName: 'Follow-Up Scheduled',
      text: `Your consultation has been saved for follow-up support. Your confidential Case Passkey is: ${passkey}.${returnText}${planText}\nPlease copy and keep this passkey safe. Whenever you return to Tumaini, click 'Resume Case' and enter this passkey to continue where you left off.`
    });

    bus.broadcast('INTAKE_STATUS', { intakeId: this.activeIntake.id, status: 'follow_up' });

    // Show result card
    const passkeyDisplay = this.followUpPasskeyDisplay || document.getElementById('followUpPasskeyDisplay');
    const resultCard = this.followUpResultCard || document.getElementById('followUpResultCard');
    if (passkeyDisplay) {
      passkeyDisplay.textContent = passkey;
    }
    if (resultCard) {
      resultCard.style.display = 'block';
    }

    this.renderMessages();
    this.renderQueue();
  }

  handleCopyFollowUpPasskey() {
    if (!this.followUpPasskeyDisplay) return;
    const text = this.followUpPasskeyDisplay.textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert(`Passkey ${text} copied to clipboard!`);
    }).catch(() => {
      alert(`Case Passkey: ${text}`);
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
