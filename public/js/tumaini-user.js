/* ==========================================================================
   TUMAINI - USER SANCTUARY CONTROLLER (UGANDA)
   - 1-on-1 Staff Emergency Intake & Triage
   - Custom Anonymous Username or Wildlife Handle Shuffle
   - Custom Category Input + Emergency Severity Tiering
   - Group Room Invite Acceptance & Moderated Confession Room
   - Instant Safety Quick Exit (Esc)
   ========================================================================== */

import { store, EMERGENCY_TIERS, PRESET_CATEGORIES } from './store.js';
import { bus } from './bus.js';

const CALM_ADJECTIVES = [
  'Quiet', 'Steady', 'Patient', 'Gentle',
  'Resilient', 'Calm', 'Swift', 'Brave',
  'Serene', 'Observant', 'Warm', 'Deep'
];

const UGANDAN_FAUNA = [
  'Crane', 'Kob', 'Shoebill', 'Otter',
  'Silverback', 'Heron', 'Weaver', 'Robin',
  'Falcon', 'Kingfisher', 'Swift', 'Drifter'
];

class TumainiUser {
  constructor() {
    this.currentIntake = null;
    this.initElements();
    this.bindEvents();
    this.checkExistingSession();
    this.renderConfessions();
    this.initSubscriptions();
  }

  generateWildlifeHandle() {
    const adj = CALM_ADJECTIVES[Math.floor(Math.random() * CALM_ADJECTIVES.length)];
    const animal = UGANDAN_FAUNA[Math.floor(Math.random() * UGANDAN_FAUNA.length)];
    const num = Math.floor(10 + Math.random() * 89);
    return `${adj} ${animal} ${num}`;
  }

  initElements() {
    // Navigation Tabs
    this.tabIntake = document.getElementById('tabIntake');
    this.tabConfessions = document.getElementById('tabConfessions');
    this.intakeSection = document.getElementById('intakeSection');
    this.confessionsSection = document.getElementById('confessionsSection');
    this.consultationView = document.getElementById('consultationView');

    // Intake Form Elements
    this.intakeForm = document.getElementById('intakeForm');
    this.usernameInput = document.getElementById('userCustomNameInput');
    this.btnShuffleName = document.getElementById('btnShuffleName');
    this.categorySelect = document.getElementById('categorySelect');
    this.customCategoryWrap = document.getElementById('customCategoryWrap');
    this.categoryChipsContainer = document.getElementById('categoryChipsContainer');
    this.customCategoryInput = document.getElementById('customCategoryInput');
    this.tierRadios = document.querySelectorAll('input[name="emergencyTier"]');

    // 1-on-1 Consultation Elements
    this.consultationTitle = document.getElementById('consultationTitle');
    this.consultationTierBadge = document.getElementById('consultationTierBadge');
    this.consultationCategoryText = document.getElementById('consultationCategoryText');
    this.groupInviteBanner = document.getElementById('groupInviteBanner');
    this.groupInviteText = document.getElementById('groupInviteText');
    this.btnAcceptInvite = document.getElementById('btnAcceptInvite');
    this.btnDeclineInvite = document.getElementById('btnDeclineInvite');
    this.chatStream = document.getElementById('consultationMessagesStream');
    this.chatInput = document.getElementById('consultationTextInput');
    this.btnSendChat = document.getElementById('btnSendConsultation');
    this.btnEndConsultation = document.getElementById('btnEndConsultation');

    // Confessions Elements
    this.confessionsFeed = document.getElementById('confessionsFeed');
    this.confessionForm = document.getElementById('submitConfessionForm');
    this.confessionText = document.getElementById('confessionText');
    this.confessionCategory = document.getElementById('confessionCategory');
    this.confessionNotice = document.getElementById('confessionSubmittedNotice');

    // Mobile Sidebar Drawer
    this.btnOpenDrawer = document.getElementById('btnOpenDrawer');
    this.btnCloseDrawer = document.getElementById('btnCloseDrawer');
    this.mobileDrawer = document.getElementById('mobileDrawer');
    this.mobileDrawerOverlay = document.getElementById('mobileDrawerOverlay');
    this.drawerLinkChat = document.getElementById('drawerLinkChat');
    this.drawerLinkConfessions = document.getElementById('drawerLinkConfessions');
    this.drawerLinkAbout = document.getElementById('drawerLinkAbout');
    this.drawerLinkPrivacy = document.getElementById('drawerLinkPrivacy');
    this.drawerQuickExit = document.getElementById('drawerQuickExit');

    // Modals
    this.aboutModal = document.getElementById('aboutModal');
    this.btnOpenAbout = document.getElementById('btnOpenAbout');
    this.btnCloseAbout = document.getElementById('btnCloseAbout');

    this.helplinesModal = document.getElementById('helplinesModal');
    this.btnOpenHelplines = document.getElementById('btnOpenHelplines');
    this.btnCloseHelplines = document.getElementById('btnCloseHelplines');
    this.btnQuickExit = document.getElementById('btnQuickExit');

    this.privacyModal = document.getElementById('privacyModal');
    this.btnOpenPrivacy = document.getElementById('btnOpenPrivacy');
    this.btnClosePrivacy = document.getElementById('btnClosePrivacy');
    this.linkOpenPrivacy = document.getElementById('linkOpenPrivacy');
    this.tabBtnDisclaimer = document.getElementById('tabBtnDisclaimer');
    this.tabBtnPrivacy = document.getElementById('tabBtnPrivacy');
    this.panelDisclaimer = document.getElementById('panelDisclaimer');
    this.panelPrivacy = document.getElementById('panelPrivacy');
    this.btnDismissPrivacyModal = document.getElementById('btnDismissPrivacyModal');
    this.drawerLinkDisclaimer = document.getElementById('drawerLinkDisclaimer');
  }

  bindEvents() {
    // Tab switching between Intake and Confessions
    if (this.tabIntake) {
      this.tabIntake.addEventListener('click', () => this.switchSanctuaryTab('intake'));
    }
    if (this.tabConfessions) {
      this.tabConfessions.addEventListener('click', () => this.switchSanctuaryTab('confessions'));
    }

    // Shuffle wildlife handle
    if (this.btnShuffleName && this.usernameInput) {
      this.btnShuffleName.addEventListener('click', () => {
        this.usernameInput.value = this.generateWildlifeHandle();
      });
    }

    // Category Dropdown Selection
    if (this.categorySelect) {
      this.categorySelect.addEventListener('change', () => {
        if (this.categorySelect.value === 'Other') {
          if (this.customCategoryWrap) this.customCategoryWrap.style.display = 'block';
          if (this.customCategoryInput) this.customCategoryInput.focus();
        } else {
          if (this.customCategoryWrap) this.customCategoryWrap.style.display = 'none';
          if (this.customCategoryInput) this.customCategoryInput.value = '';
        }
      });
    }

    // Intake submission
    if (this.intakeForm) {
      this.intakeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleIntakeSubmit();
      });
    }

    // 1-on-1 Chat sending
    if (this.btnSendChat && this.chatInput) {
      this.btnSendChat.addEventListener('click', () => this.handleSendMessage());
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Group Room Invite response
    if (this.btnAcceptInvite) {
      this.btnAcceptInvite.addEventListener('click', () => {
        if (this.currentIntake) {
          const roomId = store.acceptGroupInvite(this.currentIntake.id);
          if (roomId) {
            bus.broadcast('GROUP_INVITE_ACCEPTED', { intakeId: this.currentIntake.id, roomId });
            alert('You have entered the group circle. All messages are peer-shared.');
          }
        }
      });
    }
    if (this.btnDeclineInvite) {
      this.btnDeclineInvite.addEventListener('click', () => {
        if (this.currentIntake) {
          store.declineGroupInvite(this.currentIntake.id);
        }
      });
    }

    // End consultation
    if (this.btnEndConsultation) {
      this.btnEndConsultation.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          'End Consultation',
          'End this consultation session? Your chat will be safely closed.',
          'End Session',
          true
        );
        if (ok) {
          this.endConsultation();
        }
      });
    }

    // Confession submission
    if (this.confessionForm) {
      this.confessionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleConfessionSubmit();
      });
    }

    // Hold Space (Empathy Reaction)
    if (this.confessionsFeed) {
      this.confessionsFeed.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-hold-space');
        if (btn) {
          const confessionId = btn.dataset.confessionId;
          store.addEmpathyToConfession(confessionId);
        }
      });
    }

    // Modals
    const openModal = (m) => {
      if (!m) return;
      m.classList.add('open');
      m.classList.add('active');
    };
    const closeModal = (m) => {
      if (!m) return;
      m.classList.remove('open');
      m.classList.remove('active');
    };

    if (this.btnOpenAbout && this.aboutModal) {
      this.btnOpenAbout.addEventListener('click', () => openModal(this.aboutModal));
    }
    const heroBtnStory = document.getElementById('heroBtnStory');
    if (heroBtnStory && this.aboutModal) {
      heroBtnStory.addEventListener('click', () => openModal(this.aboutModal));
    }
    if (this.btnCloseAbout && this.aboutModal) {
      this.btnCloseAbout.addEventListener('click', () => closeModal(this.aboutModal));
    }
    if (this.aboutModal) {
      this.aboutModal.addEventListener('click', (e) => {
        if (e.target === this.aboutModal) closeModal(this.aboutModal);
      });
    }

    if (this.btnOpenHelplines && this.helplinesModal) {
      this.btnOpenHelplines.addEventListener('click', () => openModal(this.helplinesModal));
    }
    if (this.btnCloseHelplines && this.helplinesModal) {
      this.btnCloseHelplines.addEventListener('click', () => closeModal(this.helplinesModal));
    }
    if (this.helplinesModal) {
      this.helplinesModal.addEventListener('click', (e) => {
        if (e.target === this.helplinesModal) closeModal(this.helplinesModal);
      });
    }

    const switchPolicyTab = (target) => {
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
      this.tabBtnDisclaimer.addEventListener('click', () => switchPolicyTab('disclaimer'));
    }
    if (this.tabBtnPrivacy) {
      this.tabBtnPrivacy.addEventListener('click', () => switchPolicyTab('privacy'));
    }
    if (this.btnDismissPrivacyModal && this.privacyModal) {
      this.btnDismissPrivacyModal.addEventListener('click', () => closeModal(this.privacyModal));
    }

    if (this.btnOpenPrivacy && this.privacyModal) {
      this.btnOpenPrivacy.addEventListener('click', () => {
        switchPolicyTab('disclaimer');
        openModal(this.privacyModal);
      });
    }
    if (this.linkOpenPrivacy && this.privacyModal) {
      this.linkOpenPrivacy.addEventListener('click', (e) => {
        e.preventDefault();
        switchPolicyTab('privacy');
        openModal(this.privacyModal);
      });
    }
    if (this.btnClosePrivacy && this.privacyModal) {
      this.btnClosePrivacy.addEventListener('click', () => closeModal(this.privacyModal));
    }
    if (this.privacyModal) {
      this.privacyModal.addEventListener('click', (e) => {
        if (e.target === this.privacyModal) closeModal(this.privacyModal);
      });
    }

    // Mobile Sidebar Drawer
    const openDrawer = () => {
      if (this.mobileDrawer) this.mobileDrawer.classList.add('open');
      if (this.mobileDrawerOverlay) this.mobileDrawerOverlay.classList.add('open');
    };
    const closeDrawer = () => {
      if (this.mobileDrawer) this.mobileDrawer.classList.remove('open');
      if (this.mobileDrawerOverlay) this.mobileDrawerOverlay.classList.remove('open');
    };

    if (this.btnOpenDrawer) this.btnOpenDrawer.addEventListener('click', openDrawer);
    if (this.btnCloseDrawer) this.btnCloseDrawer.addEventListener('click', closeDrawer);
    if (this.mobileDrawerOverlay) this.mobileDrawerOverlay.addEventListener('click', closeDrawer);

    if (this.drawerLinkChat) {
      this.drawerLinkChat.addEventListener('click', () => {
        closeDrawer();
        this.switchSanctuaryTab('intake');
      });
    }
    if (this.drawerLinkConfessions) {
      this.drawerLinkConfessions.addEventListener('click', () => {
        closeDrawer();
        this.switchSanctuaryTab('confessions');
      });
    }
    if (this.drawerLinkAbout) {
      this.drawerLinkAbout.addEventListener('click', () => {
        closeDrawer();
        openModal(this.aboutModal);
      });
    }
    if (this.drawerLinkDisclaimer) {
      this.drawerLinkDisclaimer.addEventListener('click', () => {
        closeDrawer();
        switchPolicyTab('disclaimer');
        openModal(this.privacyModal);
      });
    }
    if (this.drawerLinkPrivacy) {
      this.drawerLinkPrivacy.addEventListener('click', () => {
        closeDrawer();
        switchPolicyTab('privacy');
        openModal(this.privacyModal);
      });
    }
    if (this.drawerQuickExit) {
      this.drawerQuickExit.addEventListener('click', () => {
        closeDrawer();
        this.quickExit();
      });
    }

    // Quick Safety Exit
    if (this.btnQuickExit) {
      this.btnQuickExit.addEventListener('click', () => this.quickExit());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.aboutModal && (this.aboutModal.classList.contains('open') || this.aboutModal.classList.contains('active'))) {
          closeModal(this.aboutModal);
        } else if (this.privacyModal && (this.privacyModal.classList.contains('open') || this.privacyModal.classList.contains('active'))) {
          closeModal(this.privacyModal);
        } else if (this.helplinesModal && (this.helplinesModal.classList.contains('open') || this.helplinesModal.classList.contains('active'))) {
          closeModal(this.helplinesModal);
        } else {
          this.quickExit();
        }
      }
      // Discreet Counselor Terminal Shortcut (Ctrl+Shift+S or Cmd+Shift+S)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        window.location.href = 'staff.html';
      }
    });
  }

  initSubscriptions() {
    store.subscribe(() => {
      if (this.currentIntake) {
        const updated = store.intakes.find(i => i.id === this.currentIntake.id);
        if (updated && updated.status !== 'resolved') {
          this.currentIntake = updated;
          this.syncConsultationView();
          this.renderMessages();
        } else {
          this.currentIntake = null;
          store.setActiveUserIntake(null);
          this.showIntakeView();
        }
      }
      this.renderConfessions();
    });
  }

  checkExistingSession() {
    const active = store.getActiveUserIntake();
    if (active && active.status !== 'resolved') {
      this.currentIntake = active;
      this.showConsultationView();
    } else {
      this.showIntakeView();
      if (this.usernameInput && !this.usernameInput.value) {
        this.usernameInput.value = this.generateWildlifeHandle();
      }
    }
  }

  switchSanctuaryTab(tab) {
    if (tab === 'intake') {
      if (this.tabIntake) this.tabIntake.classList.add('active');
      if (this.tabConfessions) this.tabConfessions.classList.remove('active');
      if (this.confessionsSection) this.confessionsSection.style.display = 'none';
      if (this.currentIntake && this.currentIntake.status !== 'resolved') {
        if (this.consultationView) this.consultationView.style.display = 'block';
        if (this.intakeSection) this.intakeSection.style.display = 'none';
      } else {
        if (this.intakeSection) this.intakeSection.style.display = 'block';
        if (this.consultationView) this.consultationView.style.display = 'none';
      }
    } else {
      if (this.tabConfessions) this.tabConfessions.classList.add('active');
      if (this.tabIntake) this.tabIntake.classList.remove('active');
      if (this.intakeSection) this.intakeSection.style.display = 'none';
      if (this.consultationView) this.consultationView.style.display = 'none';
      if (this.confessionsSection) this.confessionsSection.style.display = 'block';
      this.renderConfessions();
    }
  }

  showIntakeView() {
    if (this.intakeSection) this.intakeSection.style.display = 'block';
    if (this.consultationView) this.consultationView.style.display = 'none';
    if (this.confessionsSection) this.confessionsSection.style.display = 'none';
    if (this.tabIntake) this.tabIntake.classList.add('active');
    if (this.tabConfessions) this.tabConfessions.classList.remove('active');
  }

  showConsultationView() {
    if (this.intakeSection) this.intakeSection.style.display = 'none';
    if (this.confessionsSection) this.confessionsSection.style.display = 'none';
    if (this.consultationView) this.consultationView.style.display = 'block';
    if (this.tabIntake) this.tabIntake.classList.add('active');
    if (this.tabConfessions) this.tabConfessions.classList.remove('active');
    this.syncConsultationView();
    this.renderMessages();
  }

  handleIntakeSubmit() {
    const rawUsername = this.usernameInput ? this.usernameInput.value.trim() : '';
    const username = rawUsername || this.generateWildlifeHandle();

    // Category selection: check custom input, dropdown select, or radio
    let category = 'General Emotional Strain';
    const customCat = this.customCategoryInput ? this.customCategoryInput.value.trim() : '';

    if (customCat) {
      category = customCat;
    } else if (this.categorySelect && this.categorySelect.value && this.categorySelect.value !== 'Other') {
      category = this.categorySelect.value;
    } else {
      const checkedRadio = document.querySelector('input[name="categoryRadio"]:checked');
      if (checkedRadio && checkedRadio.value) {
        category = checkedRadio.value;
      }
    }

    // Emergency Tier
    const checkedTier = document.querySelector('input[name="emergencyTier"]:checked');
    const emergencyTier = checkedTier ? checkedTier.value : 'tier-4';

    const newIntake = store.createIntake({
      username,
      category,
      emergencyTier
    });

    this.currentIntake = newIntake;
    const initialMessages = store.getIntakeMessages(newIntake.id);
    bus.broadcast('NEW_INTAKE', { intake: newIntake, initialMessages });
    this.showConsultationView();
  }

  syncConsultationView() {
    if (!this.currentIntake) return;

    if (this.consultationTitle) {
      this.consultationTitle.textContent = this.currentIntake.username;
    }

    const tierMeta = EMERGENCY_TIERS[this.currentIntake.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    if (this.consultationTierBadge) {
      this.consultationTierBadge.textContent = tierMeta.tag;
      this.consultationTierBadge.className = `badge ${tierMeta.badgeClass}`;
    }

    if (this.consultationCategoryText) {
      const counselorLabel = this.currentIntake.counselorName
        ? `• Assigned Counselor: ${this.currentIntake.counselorName}`
        : '• Assigning on-duty counselor...';
      this.consultationCategoryText.textContent = `${this.currentIntake.category} ${counselorLabel}`;
    }

    // Group Room Invite Banner Check
    if (this.groupInviteBanner) {
      if (this.currentIntake.pendingGroupInvite) {
        this.groupInviteBanner.style.display = 'flex';
        if (this.groupInviteText) {
          const { roomTitle, staffName } = this.currentIntake.pendingGroupInvite;
          this.groupInviteText.innerHTML = `Counselor <strong>${staffName}</strong> has invited you to join the <strong>"${roomTitle}"</strong> group support circle.`;
        }
      } else {
        this.groupInviteBanner.style.display = 'none';
      }
    }
  }

  renderMessages() {
    if (!this.currentIntake || !this.chatStream) return;

    let messages = [];
    if (this.currentIntake.joinedRoomId) {
      messages = store.getGroupMessages(this.currentIntake.joinedRoomId);
    } else {
      messages = store.getIntakeMessages(this.currentIntake.id);
    }

    this.chatStream.innerHTML = '';

    if (messages.length > 0) {
      const datePill = document.createElement('div');
      datePill.className = 'whatsapp-date-pill';
      datePill.textContent = 'TODAY';
      this.chatStream.appendChild(datePill);
    }

    messages.forEach(msg => {
      const isSystem = msg.sender === 'system' || msg.senderName === 'Circle Welcome';
      const isUser = msg.sender === 'user' || msg.senderName === this.currentIntake.username;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isSystem) {
        const div = document.createElement('div');
        div.className = 'chat-system-row';
        div.innerHTML = this.formatSystemMessageHtml(msg.text);
        this.chatStream.appendChild(div);
      } else {
        const row = document.createElement('div');
        row.className = `wa-bubble-row ${isUser ? 'is-outgoing' : 'is-incoming'}`;

        const senderLabel = isUser ? 'You' : (msg.senderName || 'Tumaini Counselor');

        row.innerHTML = `
          <div class="wa-bubble-card">
            ${!isUser ? `<span class="wa-bubble-author">${this.escapeHtml(senderLabel)}</span>` : ''}
            <span class="wa-bubble-text">${this.escapeHtml(msg.text)}</span>
            <span class="wa-bubble-meta">
              ${timeStr}
              ${isUser ? '<span class="wa-check-ticks">✓✓</span>' : ''}
            </span>
          </div>
        `;
        this.chatStream.appendChild(row);
      }
    });

    this.chatStream.scrollTop = this.chatStream.scrollHeight;
  }

  handleSendMessage() {
    if (!this.currentIntake || !this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    if (this.currentIntake.joinedRoomId) {
      const msg = store.addGroupMessage({
        roomId: this.currentIntake.joinedRoomId,
        senderName: this.currentIntake.username,
        text
      });
      bus.broadcast('GROUP_MESSAGE', { roomId: this.currentIntake.joinedRoomId, message: msg });
    } else {
      const msg = store.addIntakeMessage({
        intakeId: this.currentIntake.id,
        sender: 'user',
        senderName: this.currentIntake.username,
        text
      });
      bus.broadcast('MESSAGE_SENT', { intakeId: this.currentIntake.id, message: msg });
    }

    this.chatInput.value = '';
    this.renderMessages();
  }

  showConfirm(title, message, confirmText = 'Confirm', isDanger = false) {
    return new Promise((resolve) => {
      let modal = document.getElementById('tumainiUserConfirmModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tumainiUserConfirmModal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="modal-card" style="max-width: 440px; padding: 24px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); border: 1px solid var(--border-default); background: #ffffff;">
          <h3 style="margin: 0 0 10px; font-size: 17px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading, inherit);">${this.escapeHtml(title)}</h3>
          <p style="margin: 0 0 20px; font-size: 13.5px; line-height: 1.5; color: var(--text-secondary);">${this.escapeHtml(message)}</p>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="userConfirmCancelBtn" class="btn btn-outline" style="padding: 7px 16px; font-size: 13px; border-radius: 6px; cursor: pointer;">
              Cancel
            </button>
            <button type="button" id="userConfirmOkBtn" class="btn" style="padding: 7px 18px; font-size: 13px; border-radius: 6px; cursor: pointer; font-weight: 600; ${isDanger ? 'background: #ef4444; border-color: #ef4444; color: #fff;' : 'background: var(--brand-eucalyptus, #2c4e43); border-color: var(--brand-eucalyptus, #2c4e43); color: #fff;'}">
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

      modal.querySelector('#userConfirmCancelBtn').addEventListener('click', () => cleanup(false), { once: true });
      modal.querySelector('#userConfirmOkBtn').addEventListener('click', () => cleanup(true), { once: true });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) cleanup(false);
      }, { once: true });
    });
  }

  endConsultation() {
    if (this.currentIntake) {
      const intakeId = this.currentIntake.id;
      this.currentIntake = null;
      store.setActiveUserIntake(null);
      store.updateIntakeStatus(intakeId, 'resolved');
      bus.broadcast('INTAKE_STATUS', { intakeId, status: 'resolved' });
    }
    this.showIntakeView();
  }

  // --- Confessions Logic ---
  handleConfessionSubmit() {
    const text = this.confessionText ? this.confessionText.value.trim() : '';
    const category = this.confessionCategory ? this.confessionCategory.value.trim() : 'Personal';
    const username = this.usernameInput ? this.usernameInput.value.trim() : this.generateWildlifeHandle();

    if (!text) return;

    const newConfession = store.submitConfession({
      username,
      category,
      text
    });

    bus.broadcast('NEW_CONFESSION', { confession: newConfession });

    if (this.confessionText) this.confessionText.value = '';
    if (this.confessionNotice) {
      this.confessionNotice.style.display = 'block';
      setTimeout(() => {
        this.confessionNotice.style.display = 'none';
      }, 6000);
    }
  }

  renderConfessions() {
    if (!this.confessionsFeed) return;

    const approved = store.getApprovedConfessions();
    this.confessionsFeed.innerHTML = '';

    if (approved.length === 0) {
      this.confessionsFeed.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 13.5px;">
          The confession hearth is quiet right now. If you need to put down what you are carrying, submit your confession above.
        </div>
      `;
      return;
    }

    approved.forEach(item => {
      const card = document.createElement('div');
      card.className = 'confession-hearth-card';

      const dateStr = new Date(item.createdAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      });

      card.innerHTML = `
        <div class="confession-card-top">
          <span class="confession-author-handle">${this.escapeHtml(item.username)}</span>
          <span class="confession-topic-tag">${this.escapeHtml(item.category)}</span>
        </div>
        <p class="confession-body-text">${this.escapeHtml(item.text)}</p>
        <div class="confession-card-footer">
          <span class="confession-time">${dateStr}</span>
          <button class="btn-hold-space" type="button" data-confession-id="${item.id}">
            <span>Hold Space</span>
            <strong>${item.empathyCount || 0}</strong>
          </button>
        </div>
      `;

      this.confessionsFeed.appendChild(card);
    });
  }

  quickExit() {
    window.location.replace('https://www.google.com/search?q=uganda+weather');
  }

  formatSystemMessageHtml(text) {
    let safe = this.escapeHtml(text || '');
    safe = safe.replace(/\b0800\s*21\s*21\s*21\b/g, '<a href="tel:0800212121" class="chat-tel-link">0800 21 21 21</a>');
    safe = safe.replace(/\b0800\s*211\s*306\b/g, '<a href="tel:0800211306" class="chat-tel-link">0800 211 306</a>');
    safe = safe.replace(/\b0800\s*200\s*600\b/g, '<a href="tel:0800200600" class="chat-tel-link">0800 200 600</a>');
    safe = safe.replace(/\b(Sauti\s*)?116\b/gi, (match) => {
      return match.includes('Sauti') ? 'Sauti <a href="tel:116" class="chat-tel-link">116</a>' : '<a href="tel:116" class="chat-tel-link">116</a>';
    });
    return safe;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TumainiUser();
});
