/**
 * Street world — pulled-back top-down layout matching concept art.
 * World units ≈ pixels at zoom 1. Camera uses zoom ~0.55–0.65.
 */

export const WORLD = {
  w: 1600,
  h: 1100,
};

/** Solid blockers (AABB) */
export const WALLS = [
  // Outer curb / scrap piles
  { x: 40, y: 40, w: 1520, h: 30 },
  { x: 40, y: 1030, w: 1520, h: 40 },
  { x: 40, y: 40, w: 30, h: 1030 },
  { x: 1530, y: 40, w: 30, h: 1030 },
  // Chain-link fence line (junkyard front) — gate gap handled separately
  { x: 180, y: 280, w: 420, h: 18 },
  { x: 760, y: 280, w: 660, h: 18 },
  // Garage bay backs (scenery blockers behind fence)
  { x: 200, y: 80, w: 1180, h: 140 },
];

/** Locked junkyard gate (interact → “coming in update”) */
export const GATE = {
  x: 600,
  y: 268,
  w: 160,
  h: 36,
  label: 'JUNKYARD',
};

/** Red SUV parking spot + deposit/pump hotspot */
export const SUV = {
  x: 1120,
  y: 620,
  w: 140,
  h: 90,
  interactR: 110,
};

/** BYTE dog patrol home */
export const BYTE_HOME = { x: 520, y: 640 };

/** Streetlamp positions */
export const LAMPS = [
  { x: 280, y: 480 },
  { x: 980, y: 520 },
  { x: 1380, y: 400 },
  { x: 420, y: 860 },
];

/** Garage bay numbers behind fence (scenery) */
export const BAYS = [23, 24, 25, 26, 27];

/** Spawn cans across cracked asphalt (not in SUV / gate / walls) */
export function spawnCanPositions(count = 8) {
  const spots = [
    [320, 560], [400, 720], [560, 520], [680, 780],
    [760, 600], [880, 700], [980, 820], [1080, 480],
    [480, 900], [720, 480], [1280, 780], [360, 400],
    [840, 900], [1000, 640], [620, 860], [1400, 700],
  ];
  const out = [];
  for (let i = 0; i < count && i < spots.length; i++) {
    const [x, y] = spots[i];
    out.push({ x, y, id: i, taken: false });
  }
  return out;
}

export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function resolveWalls(px, py, pw, ph) {
  let x = px, y = py;
  const body = { x, y, w: pw, h: ph };
  for (const w of WALLS) {
    if (!aabbOverlap(body, w)) continue;
    const overlapX = Math.min(body.x + body.w - w.x, w.x + w.w - body.x);
    const overlapY = Math.min(body.y + body.h - w.y, w.y + w.h - body.y);
    if (overlapX < overlapY) {
      if (body.x + body.w / 2 < w.x + w.w / 2) x -= overlapX;
      else x += overlapX;
    } else {
      if (body.y + body.h / 2 < w.y + w.h / 2) y -= overlapY;
      else y += overlapY;
    }
    body.x = x; body.y = y;
  }
  // Soft clamp to world
  x = Math.max(60, Math.min(WORLD.w - 60 - pw, x));
  y = Math.max(60, Math.min(WORLD.h - 60 - ph, y));
  return { x, y };
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.hypot(dx, dy);
}
