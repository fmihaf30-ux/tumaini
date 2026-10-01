/* ==========================================================================
   HAVEN SANCTUARY - INTERACTIVE GROUNDING TOOLS
   - 4-4-4-4 Box Breathing Exercise with SVG circular pacing
   - 5-4-3-2-1 Sensory Grounding step-by-step checklist
   - Thought Release tool with Emil Kowalski dissolve animation
   ========================================================================== */

import { sync } from './sync.js';

export class GroundingController {
  constructor() {
    this.breathingState = 'idle'; // 'inhale' | 'hold-in' | 'exhale' | 'hold-out'
    this.breathingTimer = null;
    this.countdown = 4;
    this.isRunning = false;
  }

  init() {
    this.bindBreathingEvents();
    this.bindSensoryEvents();
    this.bindThoughtReleaseEvents();
  }

  bindBreathingEvents() {
    const startBtn = document.getElementById('breathing-start-btn');
    const resetBtn = document.getElementById('breathing-reset-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.isRunning) {
          this.pauseBreathing();
          startBtn.textContent = 'Resume Breathing';
        } else {
          this.startBreathing();
          startBtn.textContent = 'Pause Breathing';
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetBreathing();
        if (startBtn) startBtn.textContent = 'Start Box Breathing';
      });
    }
  }

  startBreathing() {
    this.isRunning = true;
    sync.initAudio();
    const stateEl = document.getElementById('breathing-state');
    const timerEl = document.getElementById('breathing-timer');
    const circleEl = document.getElementById('breathing-circle-indicator');

    const phases = [
      { name: 'Inhale Slowly', duration: 4, stroke: 100 },
      { name: 'Hold Gently', duration: 4, stroke: 280 },
      { name: 'Exhale Peacefully', duration: 4, stroke: 100 },
      { name: 'Rest & Pause', duration: 4, stroke: 0 }
    ];

    let currentPhaseIndex = 0;
    this.countdown = phases[0].duration;

    const tick = () => {
      if (!this.isRunning) return;

      const phase = phases[currentPhaseIndex];
      if (stateEl) stateEl.textContent = phase.name;
      if (timerEl) timerEl.textContent = this.countdown + 's';

      if (circleEl) {
        // Animate stroke dash
        circleEl.style.transition = 'stroke-dashoffset 1s linear';
        const offset = 283 - (283 * (this.countdown / phase.duration));
        circleEl.style.strokeDashoffset = offset;
      }

      this.countdown--;

      if (this.countdown < 0) {
        currentPhaseIndex = (currentPhaseIndex + 1) % phases.length;
        this.countdown = phases[currentPhaseIndex].duration;
      }

      this.breathingTimer = setTimeout(tick, 1000);
    };

    tick();
  }

  pauseBreathing() {
    this.isRunning = false;
    clearTimeout(this.breathingTimer);
  }

  resetBreathing() {
    this.isRunning = false;
    clearTimeout(this.breathingTimer);
    this.countdown = 4;

    const stateEl = document.getElementById('breathing-state');
    const timerEl = document.getElementById('breathing-timer');
    const circleEl = document.getElementById('breathing-circle-indicator');

    if (stateEl) stateEl.textContent = 'Ready';
    if (timerEl) timerEl.textContent = '4s';
    if (circleEl) circleEl.style.strokeDashoffset = '283';
  }

  bindSensoryEvents() {
    const checkboxes = document.querySelectorAll('.sensory-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        const statusEl = document.getElementById('sensory-status');
        if (statusEl) {
          if (allChecked) {
            statusEl.innerHTML = '✨ <strong>Complete:</strong> Take a deep breath. You are anchored right here, right now.';
            statusEl.style.color = '#6ee7b7';
          } else {
            const count = Array.from(checkboxes).filter(c => c.checked).length;
            statusEl.innerHTML = `${count} of 5 grounded. Take your time.`;
            statusEl.style.color = 'var(--text-muted)';
          }
        }
      });
    });
  }

  bindThoughtReleaseEvents() {
    const releaseBtn = document.getElementById('release-thought-btn');
    const textarea = document.getElementById('thought-text');
    const feedback = document.getElementById('thought-feedback');

    if (releaseBtn && textarea) {
      releaseBtn.addEventListener('click', () => {
        const val = textarea.value.trim();
        if (!val) return;

        textarea.classList.add('dissolving');

        setTimeout(() => {
          textarea.value = '';
          textarea.classList.remove('dissolving');
          if (feedback) {
            feedback.textContent = '✨ Thought released. You do not have to carry it alone.';
            feedback.style.opacity = '1';
            setTimeout(() => {
              feedback.style.opacity = '0';
            }, 4000);
          }
        }, 800);
      });
    }
  }
}
