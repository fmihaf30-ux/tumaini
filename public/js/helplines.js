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
    numbers: [
      { display: '999', tel: '999' },
      { display: '112', tel: '112' }
    ],
    note: 'Immediate danger or a medical emergency. Free from every network.',
    critical: true
  },
  {
    id: 'sauti',
    name: 'Sauti 116 (Child & GBV Helpline)',
    numbers: [{ display: '116', tel: '116' }],
    note: 'Government helpline, free and open 24/7. Counselling and referrals for violence, abuse or distress.'
  },
  {
    id: 'butabika',
    name: 'Butabika National Referral Hospital',
    numbers: [{ display: '0800 211 306', tel: '0800211306' }],
    extra: [{ label: 'Office hours, 8 AM to 5 PM', display: '+256 414 504 375', tel: '+256414504375' }],
    note: 'National mental health hospital. Toll-free line for clinical mental health help.'
  },
  {
    id: 'redcross',
    name: 'Uganda Red Cross Ambulance',
    numbers: [{ display: '0800 211 088', tel: '0800211088' }],
    note: 'Emergency medical transport.'
  }
];

// Lines that have been reported as not connecting. Shown as a notice so a
// person is never sent to a dead number without warning.
export const UNAVAILABLE_LINES = [
  { name: 'Mental Health Uganda', display: '0800 21 21 21' }
];

const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PHONE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function numberRow(num, label) {
  return `
    <div class="hl-number-row">
      ${label ? `<span class="hl-number-label">${esc(label)}</span>` : ''}
      <div class="hl-number-actions">
        <a href="tel:${esc(num.tel)}" class="hl-call-link" aria-label="Call ${esc(num.display)}">
          ${PHONE_ICON}<span class="hl-number-text">${esc(num.display)}</span>
        </a>
        <button type="button" class="hl-copy-btn" data-copy-number="${esc(num.display)}" aria-label="Copy ${esc(num.display)}">
          ${COPY_ICON}<span>Copy</span>
        </button>
      </div>
    </div>`;
}

/**
 * Full cards for the helplines modal and the charter. Every number is visible
 * as text, tappable to call, and copyable for people without a dialer.
 */
export function renderHelplineCards(container) {
  if (!container) return;

  const cards = HELPLINES.map(line => `
    <div class="hl-card ${line.critical ? 'hl-card-critical' : ''}">
      <strong class="hl-card-name">${esc(line.name)}</strong>
      ${line.numbers.map(n => numberRow(n)).join('')}
      ${(line.extra || []).map(n => numberRow(n, n.label)).join('')}
      <span class="hl-card-note">${esc(line.note)}</span>
    </div>`).join('');

  const unavailable = UNAVAILABLE_LINES.length ? `
    <div class="hl-unavailable">
      <strong>Not connecting right now</strong>
      <span>${UNAVAILABLE_LINES.map(l => `${esc(l.name)} (${esc(l.display)})`).join(', ')} has been reported as unavailable. Please use one of the lines above instead.</span>
    </div>` : '';

  container.innerHTML = `
    ${cards}
    ${unavailable}
    <p class="hl-checked">Numbers last checked ${esc(HELPLINES_CHECKED_ON)}. If a line does not connect, try another one, or dial 999 or 112 in an emergency.</p>`;
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
  return 'If you are in immediate danger, call 999 or 112. For free support at any hour, call Sauti 116, or reach Butabika Hospital on 0800 211 306.';
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

  // Longest first so "0800 211 306" is matched before shorter fragments.
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

/* ---------- Copy-to-clipboard (one global listener) ---------- */
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
    const ok = await copyText(btn.dataset.copyNumber);
    const label = btn.querySelector('span');
    if (label) {
      const original = label.textContent;
      label.textContent = ok ? 'Copied' : 'Select & copy';
      setTimeout(() => { label.textContent = original; }, 1600);
    }
  });
}
