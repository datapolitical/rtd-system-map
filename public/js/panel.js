// The panel (DESIGN.md, "Layout"): a bottom sheet on phones with three
// heights (peek, half, full), a card on the left on wider screens. This file
// is only the container: it knows nothing about routes or stations. It handles
// showing and hiding, the drag handle, focus (in on open, back to where it
// came from on close), Esc, and tells the map how much of it the panel covers.

import { isPhone } from './shared.js';

const el = document.getElementById('panel');
const top = el.querySelector('.panel-top');
const handle = document.getElementById('panel-handle');
const title = document.getElementById('panel-title');
const sub = document.getElementById('panel-sub');
const back = document.getElementById('panel-back');
const close = document.getElementById('panel-close');
export const body = document.getElementById('panel-body');

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Layout numbers shared with app.css.
export const PEEK = 120;
export const TOP_ROOM = 116; // the search box and the key button sit above a full-height sheet
const KEY_ROOM = TOP_ROOM;
export const DESKTOP_WIDTH = 380;
export const DESKTOP_EDGE = 12;
export const DESKTOP_TOP = TOP_ROOM; // under the search box and the key button

const STEPS = ['peek', 'half', 'full'];
let mode = 'auto'; // 'auto' fits the content, up to half; the rest are the three heights
let shown = false;
let yielded = false;
let opener = null;
let nextOpener = null;
let height = 0;
let listeners = { close: () => {}, back: () => {}, resize: () => {} };

export const isOpen = () => shown;

// The control that opens the panel, named by the caller: Safari doesn't focus
// a button when it is clicked, so the panel can't always find it itself.
export function rememberOpener(el) {
  nextOpener = el;
}

export function on(handlers) {
  listeners = { ...listeners, ...handlers };
}

const viewport = () => innerHeight;
function heights() {
  const full = Math.max(PEEK + 80, viewport() - KEY_ROOM);
  return { peek: PEEK, half: Math.min(full - 60, Math.round(viewport() * 0.5)), full };
}

// What the content needs, measured with the body set free of the sheet's height.
function contentHeight() {
  body.style.flex = 'none';
  body.style.overflow = 'visible';
  const h = top.offsetHeight + body.offsetHeight;
  body.style.flex = '';
  body.style.overflow = '';
  return h;
}

function setHeight(px, animate = true) {
  height = px;
  el.classList.toggle('dragging', !animate);
  el.style.setProperty('--sheet-h', `${px}px`);
  root.style.setProperty('--sheet-h', `${px}px`);
}

// Apply the current mode to the sheet (phones only; the card sizes itself).
function layout() {
  const phone = isPhone();
  root.classList.toggle('has-sheet', shown && phone && !yielded);
  root.classList.toggle('sheet-full', shown && phone && !yielded && mode === 'full');
  root.classList.toggle('has-card', shown && !phone && !yielded);
  if (!shown || !phone) {
    root.style.setProperty('--sheet-h', '0px');
    el.style.removeProperty('--sheet-h');
    return;
  }
  const h = heights();
  const px = mode === 'auto' ? Math.min(h.half, Math.max(PEEK, contentHeight())) : h[mode];
  setHeight(px);
}

// How much of the map the panel covers, for fitting things around it.
export function covered() {
  if (!shown || yielded) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (isPhone()) {
    // A full-height sheet hides the map, so frame for the half height.
    return { top: 0, right: 0, bottom: Math.min(height, heights().half), left: 0 };
  }
  return { top: 0, right: 0, bottom: 0, left: DESKTOP_EDGE + DESKTOP_WIDTH };
}

export function show({ head, subtitle = '', content, backLabel = '', keepScroll = false }) {
  const wasShown = shown;
  if (!wasShown) {
    opener = nextOpener ?? (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
    nextOpener = null;
  }
  title.innerHTML = head;
  sub.innerHTML = subtitle;
  sub.hidden = !subtitle;
  body.innerHTML = content;
  if (!keepScroll) body.scrollTop = 0;
  back.hidden = !backLabel;
  back.setAttribute('aria-label', backLabel || 'Back');
  shown = true;
  el.hidden = false;
  if (!wasShown) {
    mode = 'auto';
    el.classList.remove('in');
    // Let the sheet start offscreen, then slide up.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  }
  const before = height;
  layout();
  if (wasShown && height !== before) setTimeout(() => listeners.resize(), reducedMotion.matches ? 0 : 260);
  title.focus({ preventScroll: true });
}

// Content that arrives after the panel opened (a note, a longer list).
export function refit() {
  if (!shown || mode !== 'auto') return;
  const before = height;
  layout();
  if (height !== before) setTimeout(() => listeners.resize(), reducedMotion.matches ? 0 : 260);
}

export function hide({ focus = true } = {}) {
  if (!shown) return;
  shown = false;
  el.hidden = true;
  el.classList.remove('in');
  layout();
  const to = opener;
  opener = null;
  if (focus && to?.isConnected) to.focus({ preventScroll: true });
  listeners.close();
}

// While the key is open it takes the corner, so the panel steps aside
// without losing what it was showing.
export function stepAside(aside) {
  yielded = aside;
  el.classList.toggle('aside', aside);
  layout();
}

// --- Sheet: tap and drag the handle --------------------------------------

function snap(to, notify = true) {
  mode = to;
  layout();
  if (notify) setTimeout(() => listeners.resize(), reducedMotion.matches ? 0 : 260);
}

const nearestStep = (px) => {
  const h = heights();
  return STEPS.reduce((best, s) => (Math.abs(h[s] - px) < Math.abs(h[best] - px) ? s : best));
};

function cycle() {
  const now = mode === 'auto' ? nearestStep(height) : mode;
  snap(STEPS[(STEPS.indexOf(now) + 1) % STEPS.length]);
}

let drag = null;
top.addEventListener('pointerdown', (e) => {
  if (!isPhone() || e.button > 0 || e.target.closest('.panel-close, .panel-back')) return;
  drag = { onHandle: !!e.target.closest('.panel-handle'), y: e.clientY, h: height, t: e.timeStamp, last: e.clientY, lastT: e.timeStamp, moved: false, v: 0 };
  top.setPointerCapture(e.pointerId);
});
top.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = drag.y - e.clientY;
  if (Math.abs(dy) > 5) drag.moved = true;
  if (!drag.moved) return;
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = (drag.last - e.clientY) / dt; // px per ms, up is positive
  drag.last = e.clientY;
  drag.lastT = e.timeStamp;
  const h = heights();
  setHeight(Math.max(40, Math.min(h.full, drag.h + dy)), false);
});
const release = (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  el.classList.remove('dragging');
  if (!d.moved) {
    if (d.onHandle) cycle();
    return;
  }
  if (height < PEEK * 0.6) return hide();
  let step = nearestStep(height);
  // A flick moves one step in its direction.
  if (Math.abs(d.v) > 0.5) {
    const i = STEPS.indexOf(step);
    const bias = d.v > 0 ? 1 : -1;
    if ((bias > 0 && heights()[step] < height + 20) || (bias < 0 && heights()[step] > height - 20)) {
      step = STEPS[Math.max(0, Math.min(2, i + bias))];
    }
  }
  snap(step);
};
top.addEventListener('pointerup', release);
top.addEventListener('pointercancel', () => {
  drag = null;
  layout();
});
// The handle is a real button: Enter and Space (a click with no pointer) and
// the arrow keys move the sheet too.
handle.addEventListener('click', (e) => {
  if (e.detail === 0) cycle();
});
handle.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const now = mode === 'auto' ? nearestStep(height) : mode;
  const i = STEPS.indexOf(now) + (e.key === 'ArrowUp' ? 1 : -1);
  snap(STEPS[Math.max(0, Math.min(2, i))]);
});

close.addEventListener('click', () => hide());
back.addEventListener('click', () => listeners.back());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shown && !yielded && !e.defaultPrevented) {
    e.preventDefault();
    hide();
  }
});
addEventListener('resize', () => {
  if (!shown) return;
  layout();
  listeners.resize();
});
