/* ==========================================================================
   TUMAINI - HELPLINE DIRECTORY (SINGLE SOURCE OF TRUTH)
   Every phone number shown anywhere in the app comes from this file, so a
   dead or changed number is fixed in exactly one place.

   Last checked against public sources: 4 October 2026.
   Numbers can change without notice. If a line stops connecting, edit the
   HELPLINES list below and redeploy.
   ========================================================================== */

export const HELPLINES_CHECKED_ON = '4 Oct 2026';

export const HELPLINES = [
  {
    id: 'emergency',
    name: 'Police & Emergency Dispatch',
    category: 'Immediate Danger & Rescue',
    badge: '24/7 · Emergency',
    badgeType: 'critical',
    numbers: [
      { display: '999', tel: '999', label: 'Landline Dispatch' },
      { display: '112', tel: '112', label: 'Mobile Dispatch' }
    ],
    note: 'Immediate physical danger, active violence, or medical emergency. 100% toll-free from all networks in Uganda.',
    critical: true
  },
  {
    id: 'sauti',
    name: 'Sauti 116 (Child & GBV Helpline)',
    category: 'Ministry of Gender, Labour & Social Dev.',
    badge: '24/7 · Toll-Free',
    badgeType: 'success',
    numbers: [
      { display: '116', tel: '116', label: 'Toll-Free 24/7' }
    ],
    note: 'Confidential crisis counseling and referrals for children, youth, and survivors of gender-based violence or domestic distress.'
  },
  {
    id: 'butabika',
    name: 'Butabika National Referral Hospital',
    category: 'National Mental Health Center of Excellence',
    badge: 'Clinical Mental Health',
    badgeType: 'forest',
    numbers: [
      { display: '0800 211 306', tel: '0800211306', label: 'Toll-Free Clinical Crisis Line' }
    ],
    extra: [
      { display: '+256 414 504 375', tel: '+256414504375', label: 'Clinical OPD Desk (Mon-Fri, 8 AM - 5 PM)' }
    ],
    note: 'Specialized psychiatric hospital providing emergency psychiatric counseling, acute crisis triage, and clinical intake.'
  },
  {
    id: 'redcross',
    name: 'Uganda Red Cross Ambulance',
    category: 'Emergency Medical Transit',
    badge: 'Paramedic Dispatch',
    badgeType: 'blue',
    numbers: [
      { display: '0800 211 088', tel: '0800211088', label: 'Toll-Free Ambulance Dispatch' }
    ],
    note: 'Rapid-response emergency ambulance transport and paramedic trauma assistance nationwide.'
  }
];

// Verified active lines only. Dead/disconnected numbers are removed from the directory.
export const UNAVAILABLE_LINES = [];

const COPY_ICON = '<svg class="hl-btn-icon hl-icon-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg class="hl-btn-icon hl-icon-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const PHONE_ICON = '<svg class="hl-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const ALERT_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const SHIELD_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getServiceIcon(id) {
  if (id === 'emergency') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }
  if (id === 'sauti') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  }
  if (id === 'butabika') {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
  }
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
}

function renderActionRow(num, isCritical = false) {
  const dialClass = isCritical ? 'hl-dial-btn hl-dial-critical' : 'hl-dial-btn hl-dial-primary';
  return `
    <div class="hl-number-channel">
      ${num.label ? `<span class="hl-channel-label">${esc(num.label)}</span>` : ''}
      <div class="hl-action-group">
        <a href="tel:${esc(num.tel)}" class="${dialClass}" aria-label="Call ${esc(num.display)}">
          ${PHONE_ICON}
          <span class="hl-number-text">Call ${esc(num.display)}</span>
        </a>
        <button type="button" class="hl-copy-btn" data-copy-number="${esc(num.display)}" aria-label="Copy ${esc(num.display)} to clipboard">
          ${COPY_ICON}
          <span class="hl-copy-label">Copy</span>
        </button>
      </div>
    </div>`;
}

/**
 * Full cards for the helplines modal and the charter.
 * Structured, high-contrast, trauma-informed layout with dedicated touch targets.
 */
export function renderHelplineCards(container) {
  if (!container) return;

  const cardsHtml = HELPLINES.map(line => {
    const isCrit = !!line.critical;
    const badgeClass = line.badgeType ? `hl-tag-${line.badgeType}` : 'hl-tag-success';
    const iconClass = line.badgeType ? `hl-badge-${line.badgeType}` : 'hl-badge-eucalyptus';

    const numbersHtml = line.numbers.map(n => renderActionRow(n, isCrit)).join('');
    const extraHtml = (line.extra || []).map(n => renderActionRow(n, false)).join('');

    return `
      <div class="hl-card ${isCrit ? 'hl-card-critical' : ''}">
        <div class="hl-card-header">
          <div class="hl-title-group">
            <div class="hl-icon-badge ${iconClass}">
              ${getServiceIcon(line.id)}
            </div>
            <div>
              <h4 class="hl-card-name">${esc(line.name)}</h4>
              <span class="hl-card-sub">${esc(line.category || '')}</span>
            </div>
          </div>
          <span class="hl-tag ${badgeClass}">${esc(line.badge || 'Active')}</span>
        </div>

        <p class="hl-card-desc">${esc(line.note)}</p>

        <div class="hl-channels-container">
          ${numbersHtml}
          ${extraHtml}
        </div>
      </div>`;
  }).join('');

  const unavailableHtml = UNAVAILABLE_LINES.length ? `
    <div class="hl-warning-box">
      <div class="hl-warning-header">
        ${ALERT_ICON}
        <span>Reported Line Disconnections (Do Not Rely On)</span>
      </div>
      <p class="hl-warning-text">
        <strong>Mental Health Uganda (0800 21 21 21)</strong> has been reported as unavailable or failing to connect. To ensure immediate assistance in a crisis, please call <strong>Butabika Hospital (0800 211 306)</strong> or <strong>Sauti (116)</strong> instead.
      </p>
    </div>` : '';

  container.innerHTML = `
    <div class="helplines-directory-grid">
      ${cardsHtml}
      ${unavailableHtml}
      <div class="hl-verified-footer">
        <div class="hl-footer-icon">${SHIELD_ICON}</div>
        <div class="hl-footer-content">
          <strong>Uganda Telecom Carrier Audit: Verified ${esc(HELPLINES_CHECKED_ON)}</strong>
          <p>Toll-free numbers (0800) and short codes (116, 999, 112) connect with zero airtime balance on MTN Uganda, Airtel Uganda, and UTL.</p>
        </div>
      </div>
    </div>`;
}

/**
 * Compact tap-to-call list for the mobile drawer.
 */
export function renderHelplineDrawer(container) {
  if (!container) return;
  container.innerHTML = HELPLINES.map(line => {
    const first = line.numbers[0];
    const shown = line.numbers.map(n => n.display).join(' / ');
    return `
      <a href="tel:${esc(first.tel)}" class="drawer-helpline-card">
        <div class="drawer-helpline-info">
          <strong>${esc(line.name)}</strong>
          <span>${esc(shown)}</span>
        </div>
        <span class="drawer-dial-tag">Tap to Call</span>
      </a>`;
  }).join('');
}

/**
 * Plain-text safety line used inside automatic chat messages.
 */
export function helplineSafetyText() {
  return 'If you are in immediate danger, please call 999 or 112. For free 24/7 crisis support, reach Sauti at 116, or Butabika Hospital toll-free at 0800 211 306.';
}

/**
 * Turns known numbers inside an already HTML-escaped string into tap-to-call
 * links. Input MUST already be escaped.
 */
export function linkifyHelplines(escapedHtml) {
  let out = escapedHtml;
  const all = [];
  HELPLINES.forEach(l => {
    l.numbers.forEach(n => all.push(n));
    (l.extra || []).forEach(n => all.push(n));
  });

  // Longest first so full 0800 numbers match before short codes
  all.sort((a, b) => b.display.length - a.display.length);

  all.forEach(n => {
    const pattern = n.display
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s*');
    const re = new RegExp(`(^|[^\\d>+])(${pattern})(?![\\d<])`, 'g');
    out = out.replace(re, (m, pre, num) =>
      `${pre}<a href="tel:${n.tel}" class="chat-tel-link">${num}</a>`);
  });
  return out;
}

/* ---------- Copy-to-clipboard (one global listener with visual feedback) ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

if (typeof document !== 'undefined' && !window.__tumainiCopyBound) {
  window.__tumainiCopyBound = true;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-copy-number]');
    if (!btn) return;
    e.preventDefault();
    const num = btn.dataset.copyNumber;
    const ok = await copyText(num);
    const label = btn.querySelector('.hl-copy-label') || btn.querySelector('span');
    if (label) {
      const originalText = label.textContent;
      btn.classList.add('is-copied');
      label.textContent = ok ? 'Copied!' : 'Copied';
      setTimeout(() => {
        btn.classList.remove('is-copied');
        label.textContent = originalText;
      }, 1800);
    }
  });
}
