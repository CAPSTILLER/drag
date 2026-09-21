/** Keyboard + simple touch input */
const keys = new Set();

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'e', 'f', 'r'].includes(k) || e.code === 'Space') {
      e.preventDefault();
    }
    keys.add(k);
    if (e.code === 'Space') keys.add(' ');
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.code === 'Space') keys.delete(' ');
  });
  window.addEventListener('blur', () => keys.clear());

  // Touch: tap left/right/up/down thirds as virtual pad
  let touchId = null;
  let touchOrigin = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (touchId != null) return;
    touchId = e.pointerId;
    touchOrigin = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchId || !touchOrigin) return;
    const dx = e.clientX - touchOrigin.x;
    const dy = e.clientY - touchOrigin.y;
    const dead = 18;
    keys.delete('w'); keys.delete('a'); keys.delete('s'); keys.delete('d');
    if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) keys.add('d'); else keys.add('a');
      } else {
        if (dy > 0) keys.add('s'); else keys.add('w');
      }
    }
  });
  const endTouch = (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    touchOrigin = null;
    keys.delete('w'); keys.delete('a'); keys.delete('s'); keys.delete('d');
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
}

export function getMoveVector() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = 1 / Math.SQRT2;
    x *= inv; y *= inv;
  }
  return { x, y };
}

export function consumeKey(k) {
  if (keys.has(k)) {
    keys.delete(k);
    return true;
  }
  return false;
}

export function isDown(k) {
  return keys.has(k);
}
