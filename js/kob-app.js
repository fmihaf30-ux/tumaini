/* ==========================================================================
   KOB - ANONYMOUS PEER APPLICATION CONTROLLER (UGANDA)
   - Ugandan wildlife pseudonym generator (e.g. "Quiet Crane", "Steady Kob")
   - Room navigation, message stream, and custom catalog generator
   - Client-side privacy guard (phone number shield) and crisis detector
   - Quick Safety Exit (Esc)
   ========================================================================== */

import { roomStore } from './kob-rooms.js';

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

class KobApp {
  constructor() {
    this.pseudonym = this.loadOrGeneratePseudonym();
    this.activeRoomId = null;

    this.initElements();
    this.bindEvents();
    this.renderLobby();
    this.initSubscriptions();
  }

  loadOrGeneratePseudonym() {
    try {
      const saved = sessionStorage.getItem('kob_pseudonym_v1');
      if (saved) return saved;
    } catch (e) {}

    return this.generateNewPseudonym();
  }

  generateNewPseudonym() {
    const adj = CALM_ADJECTIVES[Math.floor(Math.random() * CALM_ADJECTIVES.length)];
    const animal = UGANDAN_FAUNA[Math.floor(Math.random() * UGANDAN_FAUNA.length)];
    const num = Math.floor(10 + Math.random() * 89);
    const name = `${adj} ${animal} ${num}`;

    try {
      sessionStorage.setItem('kob_pseudonym_v1', name);
    } catch (e) {}

    return name;
  }

  initElements() {
    // Views
    this.lobbyView = document.getElementById('lobbyView');
    this.roomView = document.getElementById('roomView');

    // Lobby Elements
    this.userNameDisplay = document.getElementById('userNameDisplay');
    this.btnShuffleName = document.getElementById('btnShuffleName');
    this.roomsGrid = document.getElementById('roomsGrid');
    this.createRoomForm = document.getElementById('createRoomForm');
    this.customRoomTitle = document.getElementById('customRoomTitle');
    this.customRoomDesc = document.getElementById('customRoomDesc');

    // Active Room Elements
    this.roomActiveTitle = document.getElementById('roomActiveTitle');
    this.roomTagBadge = document.getElementById('roomTagBadge');
    this.chatStream = document.getElementById('chatStream');
    this.chatInput = document.getElementById('chatInput');
    this.btnSendMessage = document.getElementById('btnSendMessage');
    this.btnLeaveRoom = document.getElementById('btnLeaveRoom');
    this.quickPromptsRow = document.getElementById('quickPromptsRow');
    this.crisisRoomStrip = document.getElementById('crisisRoomStrip');

    // Hotlines Modal
    this.hotlinesModal = document.getElementById('hotlinesModal');
    this.btnOpenHelplines = document.getElementById('btnOpenHelplines');
    this.btnCloseHelplines = document.getElementById('btnCloseHelplines');
    this.btnQuickExit = document.getElementById('btnQuickExit');
  }

  bindEvents() {
    // Shuffle Name
    if (this.btnShuffleName) {
      this.btnShuffleName.addEventListener('click', () => {
        this.pseudonym = this.generateNewPseudonym();
        if (this.userNameDisplay) this.userNameDisplay.textContent = this.pseudonym;
      });
    }

    // Create Custom Room
    if (this.createRoomForm) {
      this.createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = this.customRoomTitle ? this.customRoomTitle.value.trim() : '';
        const desc = this.customRoomDesc ? this.customRoomDesc.value.trim() : '';

        if (!title) return;

        const newRoom = roomStore.createCustomRoom(title, desc);
        this.customRoomTitle.value = '';
        if (this.customRoomDesc) this.customRoomDesc.value = '';
        this.enterRoom(newRoom.id);
      });
    }

    // Leave Room
    if (this.btnLeaveRoom) {
      this.btnLeaveRoom.addEventListener('click', () => {
        this.leaveRoom();
      });
    }

    // Send Message
    if (this.btnSendMessage && this.chatInput) {
      this.btnSendMessage.addEventListener('click', () => this.handleSendMessage());
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Quick prompts
    if (this.quickPromptsRow) {
      this.quickPromptsRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.prompt-chip');
        if (chip && this.chatInput) {
          this.chatInput.value = chip.dataset.prompt || chip.textContent.trim();
          this.chatInput.focus();
        }
      });
    }

    // Hotlines Modal
    if (this.btnOpenHelplines && this.hotlinesModal) {
      this.btnOpenHelplines.addEventListener('click', () => {
        this.hotlinesModal.classList.add('active');
      });
    }
    if (this.btnCloseHelplines && this.hotlinesModal) {
      this.btnCloseHelplines.addEventListener('click', () => {
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

    // Quick Exit
    if (this.btnQuickExit) {
      this.btnQuickExit.addEventListener('click', () => this.quickExit());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.hotlinesModal && this.hotlinesModal.classList.contains('active')) {
          this.hotlinesModal.classList.remove('active');
        } else {
          this.quickExit();
        }
      }
    });
  }

  initSubscriptions() {
    roomStore.subscribe(() => {
      if (this.activeRoomId) {
        this.renderChatMessages();
      } else {
        this.renderLobby();
      }
    });
  }

  renderLobby() {
    if (this.userNameDisplay) {
      this.userNameDisplay.textContent = this.pseudonym;
    }

    if (!this.roomsGrid) return;
    this.roomsGrid.innerHTML = '';

    const rooms = roomStore.getAllRooms();
    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-card';
      card.dataset.roomId = room.id;

      card.innerHTML = `
        <div class="room-card-top">
          <span class="room-title">${this.escapeHtml(room.title)}</span>
          <span class="room-peers-badge">${room.tag}</span>
        </div>
        <p class="room-desc">${this.escapeHtml(room.desc)}</p>
        <div class="room-join-footer">
          <span>Enter Safe Space</span>
          <span>→</span>
        </div>
      `;

      card.addEventListener('click', () => this.enterRoom(room.id));
      this.roomsGrid.appendChild(card);
    });
  }

  enterRoom(roomId) {
    const room = roomStore.getRoom(roomId);
    if (!room) return;

    this.activeRoomId = roomId;

    if (this.roomActiveTitle) this.roomActiveTitle.textContent = room.title;
    if (this.roomTagBadge) this.roomTagBadge.textContent = room.tag;

    if (this.lobbyView) this.lobbyView.style.display = 'none';
    if (this.roomView) this.roomView.classList.add('active');

    this.renderChatMessages();

    // Focus input
    if (this.chatInput) this.chatInput.focus();
  }

  leaveRoom() {
    this.activeRoomId = null;
    if (this.roomView) this.roomView.classList.remove('active');
    if (this.lobbyView) this.lobbyView.style.display = 'flex';
    this.renderLobby();
  }

  renderChatMessages() {
    if (!this.activeRoomId || !this.chatStream) return;

    const messages = roomStore.getMessages(this.activeRoomId);
    this.chatStream.innerHTML = '';

    if (messages.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'system-announcement';
      welcome.textContent = 'Room open. You are anonymous here. Share when you feel ready.';
      this.chatStream.appendChild(welcome);
    }

    messages.forEach(msg => {
      const isMine = msg.senderName === this.pseudonym;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const row = document.createElement('div');
      row.className = `msg-row ${isMine ? 'is-mine' : 'is-peer'}`;

      row.innerHTML = `
        <div class="msg-sender-line ${isMine ? 'mine' : ''}">
          <span>${isMine ? 'You (' + this.escapeHtml(msg.senderName) + ')' : this.escapeHtml(msg.senderName)}</span>
        </div>
        <div class="msg-bubble">${this.escapeHtml(msg.text)}</div>
        <span class="msg-time">${timeStr}</span>
      `;

      this.chatStream.appendChild(row);
    });

    this.chatStream.scrollTop = this.chatStream.scrollHeight;
  }

  handleSendMessage() {
    if (!this.activeRoomId || !this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    // 1. Phone number shield: warn against posting real numbers in Uganda
    const phonePattern = /(\+?256|0)[7]\d{8}/;
    if (phonePattern.test(text)) {
      alert('For your safety and privacy in Uganda, do not share phone numbers or mobile money details in open rooms.');
      return;
    }

    // 2. Crisis keyword check (Gentle non-intrusive safety banner)
    const crisisPattern = /(suicide|kill myself|end my life|end it all|hang myself|poison)/i;
    if (crisisPattern.test(text)) {
      if (this.crisisRoomStrip) {
        this.crisisRoomStrip.style.display = 'flex';
      }
    }

    roomStore.addMessage(this.activeRoomId, {
      senderName: this.pseudonym,
      text
    });

    this.chatInput.value = '';
    this.renderChatMessages();
  }

  quickExit() {
    // Instantly navigate away to neutral Uganda weather/news
    window.location.replace('https://www.google.com/search?q=uganda+weather');
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new KobApp();
});
