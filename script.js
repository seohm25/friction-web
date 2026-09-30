let shapes = [];
let images = {};

// Distances are CSS pixels; speeds are pixels per millisecond.
const GESTURE = {
  jitter: 3,
  tapSlop: 8,
  holdMs: 250,
  doubleTapMs: 300,
  doubleTapRadius: 28,
  nudgeMax: 14,
  swipeDistance: 24,
  swipeSpeed: 0.18,
  flickDistance: 8,
  flickSpeed: 0.5,
  speedWindowMs: 70,
  pinchStep: 2.5,
  trailDistance: 9,
  trailMs: 45,
};

const pointers = new Map();
let session = null;
let pairDistance = null;
let pendingTap = null;
let tapTimer = null;

function preload() {
  for (const type of ['drag', 'swipe', 'flick', 'nudge', 'pinch',
    'spread', 'single_tap', 'double_tap', 'short_hold']) {
    images[type] = loadImage(`assets/${type}@4x.png`);
  }
}

function setup() {
  const cnv = createCanvas(3000, 2000);
  cnv.position(0, 0);
  cnv.style('z-index', '10');
  cnv.style('pointer-events', 'auto');
  cnv.style('touch-action', 'none');
  cnv.style('user-select', 'none');
  const canvas = cnv.elt;
  canvas.addEventListener('pointerdown', startPointer);
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', cancelPointer);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('blur', resetPointers);
  clear();
}

function draw() {
  clear();
  for (const s of shapes) {
    const img = images[s.type];
    if (img) image(img, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointFrom(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top,
    t: performance.now() };
}

function addShape(type, point, size) {
  shapes.push({ type, x: point.x, y: point.y, size });
}

function flushTap() {
  clearTimeout(tapTimer);
  if (pendingTap) addShape('single_tap', pendingTap, 50);
  pendingTap = null;
  tapTimer = null;
}

function startPointer(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  const p = pointFrom(event);
  pointers.set(event.pointerId, p);
  if (pointers.size === 1) {
    session = { start: p, maxDistance: 0, samples: [p], multi: false,
      lastShape: null, lastType: null };
  } else {
    session.multi = true;
    flushTap();
    pairDistance = pointers.size === 2 ? distance(...pointers.values()) : null;
  }
}

function movePointer(event) {
  if (!pointers.has(event.pointerId) || !session) return;
  event.preventDefault();
  const p = pointFrom(event);
  pointers.set(event.pointerId, p);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = distance(a, b);
    if (pairDistance === null) pairDistance = d;
    const delta = d - pairDistance;
    // Accumulate even tiny movements until they pass the noise threshold.
    if (Math.abs(delta) >= GESTURE.pinchStep) {
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const type = delta < 0 ? 'pinch' : 'spread';
      const size = type === 'pinch'
        ? Math.max(40, Math.min(80, 40 + d * 40 / 150))
        : Math.max(60, Math.min(120, 60 + (d - 150) * 60 / 150));
      addShape(type, center, size);
      pairDistance = d;
    }
    return;
  }
  // After a two-finger gesture, wait for all fingers to lift.
  if (session.multi) return;
  updateSingle(p);
}

function updateSingle(p) {
  const s = session;
  const displacement = distance(s.start, p);
  s.maxDistance = Math.max(s.maxDistance, displacement);
  s.samples.push(p);
  while (s.samples.length > 1 && p.t - s.samples[0].t > GESTURE.speedWindowMs) {
    s.samples.shift();
  }
  const recent = s.samples[0];
  const travel = distance(recent, p);
  const speed = travel / Math.max(1, p.t - recent.t);
  if (s.maxDistance < GESTURE.jitter) return;
  let type;
  if (travel >= GESTURE.flickDistance && speed >= GESTURE.flickSpeed) type = 'flick';
  else if (displacement >= GESTURE.swipeDistance && speed >= GESTURE.swipeSpeed) type = 'swipe';
  else if (s.maxDistance <= GESTURE.nudgeMax) type = 'nudge';
  else type = 'drag';
  const moved = s.lastShape ? distance(s.lastShape, p) : Infinity;
  if (!s.lastShape || (moved >= 1 && (type !== s.lastType ||
      moved >= GESTURE.trailDistance || p.t - s.lastShape.t >= GESTURE.trailMs))) {
    addShape(type, p, { drag: 100, swipe: 60, flick: 80, nudge: 40 }[type]);
    s.lastShape = p;
    s.lastType = type;
  }
}

function endPointer(event) {
  if (!pointers.has(event.pointerId) || !session) return;
  event.preventDefault();
  const p = pointFrom(event);
  const s = session;
  if (!s.multi) {
    const previous = pointers.get(event.pointerId);
    if (distance(previous, p) > 0) updateSingle(p);
    const duration = p.t - s.start.t;
    if (s.maxDistance <= GESTURE.tapSlop && !s.lastShape) {
      if (duration >= GESTURE.holdMs) {
        flushTap();
        addShape('short_hold', p, 50);
      } else if (pendingTap && p.t - pendingTap.t <= GESTURE.doubleTapMs &&
          distance(pendingTap, p) <= GESTURE.doubleTapRadius) {
        clearTimeout(tapTimer);
        pendingTap = null;
        addShape('double_tap', p, 30);
      } else {
        flushTap();
        pendingTap = p;
        tapTimer = setTimeout(flushTap, GESTURE.doubleTapMs);
      }
    }
  }
  pointers.delete(event.pointerId);
  if (pointers.size === 2) pairDistance = distance(...pointers.values());
  else pairDistance = null;
  if (!pointers.size) session = null;
}

function cancelPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  resetPointers();
}

function resetPointers() {
  pointers.clear();
  session = null;
  pairDistance = null;
}
