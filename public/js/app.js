/* ==========================================================================
   HAVEN SANCTUARY - MAIN APPLICATION CONTROLLER
   - Terminal View Mode management (User, Staff, Split-Screen)
   - Quick Safety Exit (Escape key disguise)
   - Crisis hotline modal management
   ========================================================================== */

import { UserTerminal } from './user-terminal.js';
import { StaffTerminal } from './staff-terminal.js';
import { sync } from './sync.js';

class App {
  constructor() {
    this.viewMode = 'split'; // Default to 'split' so user immediately sees both terminals!
    this.userTerminal = null;
    this.staffTerminal = null;
    this.init();
  }

  init() {
    this.initViewSwitcher();
    this.initHotlineModal();
    this.initQuickSafetyExit();

    // Initialize the two terminals
    this.userTerminal = new UserTerminal();
    this.staffTerminal = new StaffTerminal();

    // Set initial view mode
    this.setViewMode('split');
  }

  initViewSwitcher() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (mode) {
          this.setViewMode(mode);
        }
      });
    });
  }

  setViewMode(mode) {
    this.viewMode = mode;
    const appEl = document.getElementById('app');
    const userView = document.getElementById('user-terminal-view');
    const staffView = document.getElementById('staff-terminal-view');
    const tabs = document.querySelectorAll('.nav-tab');

    // Update active tab styling
    tabs.forEach(t => {
      if (t.dataset.mode === mode) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    if (mode === 'split') {
      appEl.classList.add('split-mode');
      if (userView) userView.classList.add('active');
      if (staffView) staffView.classList.add('active');
    } else if (mode === 'user') {
      appEl.classList.remove('split-mode');
      if (userView) userView.classList.add('active');
      if (staffView) staffView.classList.remove('active');
    } else if (mode === 'staff') {
      appEl.classList.remove('split-mode');
      if (userView) userView.classList.remove('active');
      if (staffView) staffView.classList.add('active');
    }

    // Trigger audio init on click
    sync.initAudio();
  }

  initHotlineModal() {
    const openBtn = document.getElementById('open-hotlines-btn');
    const modal = document.getElementById('hotlines-modal');
    const closeBtn = document.getElementById('close-hotlines-btn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.classList.add('active');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    }
  }

  initQuickSafetyExit() {
    const exitBtn = document.getElementById('quick-safety-exit-btn');

    const executeSafeDisguise = () => {
      // Instantly navigate or replace page with a neutral search/weather page
      window.location.replace('https://www.google.com/search?q=weather+forecast+today');
    };

    if (exitBtn) {
      exitBtn.addEventListener('click', executeSafeDisguise);
    }

    // Keyboard shortcut: Escape key triggers immediate safety exit
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('hotlines-modal');
        if (modal && modal.classList.contains('active')) {
          modal.classList.remove('active');
          return;
        }
        executeSafeDisguise();
      }
    });
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
