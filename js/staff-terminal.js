/* ==========================================================================
   HAVEN SANCTUARY - STAFF TERMINAL CONTROLLER
   - Real-time triage queue sorted by Emergency Severity Tier
   - Emergency tier filtering & priority metrics
   - Active counselor workspace, de-escalation snippets, and shift handover
   ========================================================================== */

import { state, EMERGENCY_TIERS, CATEGORIES } from './state.js';
import { sync } from './sync.js';

export class StaffTerminal {
  constructor() {
    this.currentFilter = 'all'; // 'all' | 'tier-1' | 'tier-2' | 'tier-3' | 'tier-4'
    this.activeCase = null;
    this.counselorName = 'Counselor Sarah (On Duty)';
    this.timerInterval = null;

    this.init();
  }

  init() {
    this.bindFilterEvents();
    this.bindWorkspaceEvents();
    this.bindSnippetEvents();
    this.renderQueue();
    this.startWaitTimers();

    // Subscribe to state updates
    state.subscribe(() => {
      this.renderQueue();
      if (this.activeCase) {
        // Refresh active case reference
        this.activeCase = state.cases.find(c => c.id === this.activeCase.id) || null;
        this.renderActiveCaseWorkspace();
      }
    });
  }

  bindFilterEvents() {
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.filter || 'all';
        this.renderQueue();
      });
    });
  }

  startWaitTimers() {
    this.timerInterval = setInterval(() => {
      const waitTimerEls = document.querySelectorAll('.wait-timer-val');
      waitTimerEls.forEach(el => {
        const createdAt = parseInt(el.dataset.created, 10);
        if (createdAt) {
          el.textContent = this.formatWaitTime(createdAt);
        }
      });
    }, 1000);
  }

  formatWaitTime(createdAt) {
    const diffSec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }

  renderQueue() {
    const listEl = document.getElementById('staff-triage-list');
    const totalCountEl = document.getElementById('metric-total-queue');
    const criticalCountEl = document.getElementById('metric-critical-count');
    const panicCountEl = document.getElementById('metric-panic-count');

    // 1. Get Cases Ranked by Emergency Severity Tier
    const sortedCases = state.getCasesSortedByEmergency(this.currentFilter);
    const allCases = state.cases.filter(c => c.status !== 'resolved');

    // 2. Update metrics
    if (totalCountEl) totalCountEl.textContent = allCases.length;
    if (criticalCountEl) {
      criticalCountEl.textContent = allCases.filter(c => c.emergencyTier === 'tier-1').length;
    }
    if (panicCountEl) {
      panicCountEl.textContent = allCases.filter(c => c.emergencyTier === 'tier-2').length;
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    if (sortedCases.length === 0) {
      listEl.innerHTML = `
        <div class="empty-queue">
          <div style="font-size: 24px; color: #10b981;">✓</div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">No active cases in this filter</div>
          <div style="font-size: 11px;">Queue is clear and peaceful.</div>
        </div>
      `;
      return;
    }

    sortedCases.forEach(userCase => {
      const tierMeta = EMERGENCY_TIERS[userCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
      const catMeta = CATEGORIES[userCase.category] || CATEGORIES['anxiety'];
      const isActive = this.activeCase && this.activeCase.id === userCase.id;

      const card = document.createElement('div');
      card.className = `queue-card ${userCase.emergencyTier}-case ${isActive ? 'active-case' : ''}`;
      card.dataset.caseId = userCase.id;

      card.innerHTML = `
        <div class="queue-card-top">
          <div class="queue-user-name">
            <span class="tier-indicator-dot ${tierMeta.dotClass} ${tierMeta.isEmergency ? 'indicator-critical' : ''}"></span>
            <strong>${this.escapeHtml(userCase.pseudonym)}</strong>
          </div>
          <div class="wait-timer ${tierMeta.isEmergency ? 'urgent' : ''}">
            ⏱️ <span class="wait-timer-val" data-created="${userCase.createdAt}">${this.formatWaitTime(userCase.createdAt)}</span>
          </div>
        </div>

        <div class="queue-card-meta">
          <span class="badge ${tierMeta.badgeClass}">${tierMeta.tag}</span>
          <span class="badge-category">${catMeta.icon} ${catMeta.label}</span>
          ${userCase.counselorName ? `<span style="font-size: 10px; color: #c4b5fd;">👤 ${this.escapeHtml(userCase.counselorName)}</span>` : ''}
        </div>

        <div class="queue-card-footer">
          <span class="case-status-indicator">Status: <strong>${userCase.status.replace('_', ' ').toUpperCase()}</strong></span>
          <button class="claim-btn" data-action="claim">${userCase.counselorName ? 'View Session' : 'Claim & Support'}</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        this.selectCase(userCase);
      });

      const claimBtn = card.querySelector('[data-action="claim"]');
      if (claimBtn) {
        claimBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.claimCase(userCase);
        });
      }

      listEl.appendChild(card);
    });
  }

  selectCase(userCase) {
    this.activeCase = userCase;
    state.setActiveStaffCase(userCase.id);
    this.renderActiveCaseWorkspace();
    this.renderQueue(); // refresh active border
  }

  claimCase(userCase) {
    state.updateCaseStatus(userCase.id, 'in_session', this.counselorName);
    this.selectCase(userCase);
    sync.broadcast('CASE_CLAIMED', { caseId: userCase.id, counselorName: this.counselorName });

    // Send greeting from counselor into chat
    const messages = state.getMessagesForCase(userCase.id);
    const alreadyGreeted = messages.some(m => m.sender === 'counselor');
    if (!alreadyGreeted) {
      state.addMessage({
        caseId: userCase.id,
        sender: 'counselor',
        senderName: this.counselorName,
        text: `Hello ${userCase.pseudonym}, I am ${this.counselorName}. I am right here with you. Please take your time, and tell me what is feeling heaviest right now.`
      });
      sync.broadcast('NEW_MESSAGE', { caseId: userCase.id });
    }
  }

  renderActiveCaseWorkspace() {
    const noCaseView = document.getElementById('staff-no-case-view');
    const activeView = document.getElementById('staff-active-case-view');

    if (!this.activeCase) {
      if (noCaseView) noCaseView.style.display = 'flex';
      if (activeView) activeView.classList.remove('active');
      return;
    }

    if (noCaseView) noCaseView.style.display = 'none';
    if (activeView) activeView.classList.add('active');

    // Populate header details
    const nameEl = document.getElementById('staff-active-pseudonym');
    const caseIdEl = document.getElementById('staff-active-case-id');
    const tierBadgeEl = document.getElementById('staff-active-tier-badge');
    const catBadgeEl = document.getElementById('staff-active-cat-badge');
    const statusSelect = document.getElementById('staff-case-status-select');

    const tierMeta = EMERGENCY_TIERS[this.activeCase.emergencyTier] || EMERGENCY_TIERS['tier-4'];
    const catMeta = CATEGORIES[this.activeCase.category] || CATEGORIES['anxiety'];

    if (nameEl) nameEl.textContent = this.activeCase.pseudonym;
    if (caseIdEl) caseIdEl.textContent = this.activeCase.id;
    if (tierBadgeEl) {
      tierBadgeEl.className = `badge ${tierMeta.badgeClass}`;
      tierBadgeEl.textContent = tierMeta.title;
    }
    if (catBadgeEl) {
      catBadgeEl.textContent = `${catMeta.icon} ${catMeta.label}`;
    }
    if (statusSelect) {
      statusSelect.value = this.activeCase.status;
    }

    // Populate checklist & notes
    const chkHarm = document.getElementById('chk-harm-risk');
    const chkGrounding = document.getElementById('chk-grounding-offered');
    const chkHotline = document.getElementById('chk-hotline-provided');
    const notesArea = document.getElementById('staff-case-notes');

    if (chkHarm) chkHarm.checked = !!this.activeCase.checklist?.harmCheck;
    if (chkGrounding) chkGrounding.checked = !!this.activeCase.checklist?.groundingOffered;
    if (chkHotline) chkHotline.checked = !!this.activeCase.checklist?.hotlineProvided;
    if (notesArea) notesArea.value = this.activeCase.notes || '';

    this.renderCounselorMessages();
  }

  renderCounselorMessages() {
    if (!this.activeCase) return;
    const container = document.getElementById('counselor-chat-messages');
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
        const isCounselor = msg.sender === 'counselor';
        row.className = `message-bubble-row ${isCounselor ? 'user' : 'counselor'} msg-animate`;
        row.innerHTML = `
          <div class="message-sender">${isCounselor ? 'You (' + this.escapeHtml(msg.senderName) + ')' : this.escapeHtml(msg.senderName)}</div>
          <div class="message-bubble" style="${isCounselor ? 'background: #8b5cf6;' : ''}">${this.escapeHtml(msg.text)}</div>
          <div class="message-timestamp">${timeStr}</div>
        `;
      }
      container.appendChild(row);
    });

    container.scrollTop = container.scrollHeight;
  }

  bindWorkspaceEvents() {
    const sendBtn = document.getElementById('counselor-send-btn');
    const input = document.getElementById('counselor-chat-input');
    const statusSelect = document.getElementById('staff-case-status-select');
    const escalateBtn = document.getElementById('staff-escalate-btn');
    const notesArea = document.getElementById('staff-case-notes');
    const chkHarm = document.getElementById('chk-harm-risk');
    const chkGrounding = document.getElementById('chk-grounding-offered');
    const chkHotline = document.getElementById('chk-hotline-provided');

    const handleSend = () => {
      const text = input?.value.trim();
      if (!text || !this.activeCase) return;

      input.value = '';

      state.addMessage({
        caseId: this.activeCase.id,
        sender: 'counselor',
        senderName: this.counselorName,
        text
      });

      sync.broadcast('NEW_MESSAGE', { caseId: this.activeCase.id });
      sync.playChime('soft');
      this.renderCounselorMessages();
    };

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        if (this.activeCase) {
          state.updateCaseStatus(this.activeCase.id, statusSelect.value);
          sync.broadcast('STATUS_UPDATE', { caseId: this.activeCase.id, status: statusSelect.value });
        }
      });
    }

    if (escalateBtn) {
      escalateBtn.addEventListener('click', () => {
        if (!this.activeCase) return;
        const conf = confirm('Escalate this case to Tier 1: Critical Emergency Protocol?');
        if (conf) {
          this.activeCase.emergencyTier = 'tier-1';
          this.activeCase.isEmergency = true;
          state.saveCases();
          state.addMessage({
            caseId: this.activeCase.id,
            sender: 'system',
            senderName: 'Triage Supervisor',
            text: '⚠️ Priority elevated to Tier 1 Critical. Emergency supervisor and crisis hotlines linked.'
          });
          sync.broadcast('NEW_MESSAGE', { caseId: this.activeCase.id });
          sync.playChime('urgent');
          this.renderActiveCaseWorkspace();
          this.renderQueue();
        }
      });
    }

    if (notesArea) {
      notesArea.addEventListener('input', () => {
        if (this.activeCase) {
          state.updateCaseNotes(this.activeCase.id, notesArea.value);
        }
      });
    }

    const handleChecklist = () => {
      if (this.activeCase) {
        state.updateChecklist(this.activeCase.id, 'harmCheck', !!chkHarm?.checked);
        state.updateChecklist(this.activeCase.id, 'groundingOffered', !!chkGrounding?.checked);
        state.updateChecklist(this.activeCase.id, 'hotlineProvided', !!chkHotline?.checked);
      }
    };

    if (chkHarm) chkHarm.addEventListener('change', handleChecklist);
    if (chkGrounding) chkGrounding.addEventListener('change', handleChecklist);
    if (chkHotline) chkHotline.addEventListener('change', handleChecklist);
  }

  bindSnippetEvents() {
    const snippets = document.querySelectorAll('.snippet-chip');
    const input = document.getElementById('counselor-chat-input');

    snippets.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        if (input && text) {
          input.value = text;
          input.focus();
        }
      });
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
