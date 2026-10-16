    // --- Synthesizer Audio ---
    let audioEnabled = true;
    let audioCtx = null;

    function getAudioContext() {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function toggleAudio() {
      audioEnabled = !audioEnabled;
      document.getElementById('btn-audio').innerHTML = audioEnabled ? '<span>🔊 Audio: ON</span>' : '<span>🔇 Audio: OFF</span>';
      if (audioEnabled) playTone(440, 'triangle', 0.1, 0.05);
    }

    function playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.1) {
      if (!audioEnabled || (typeof det !== 'undefined' && det.replaying)) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {}
    }

    function playCanSfx() {
      playTone(620, 'square', 0.05, 0.07);
      setTimeout(() => playTone(920, 'triangle', 0.07, 0.07), 35);
    }

    function playDumpSfx() {
      playTone(180, 'sawtooth', 0.25, 0.15);
      setTimeout(() => playTone(320, 'triangle', 0.2, 0.15), 100);
      setTimeout(() => playTone(540, 'sine', 0.35, 0.2), 220);
    }

    function playEngineSfx() {
      playTone(105, 'sawtooth', 0.2, 0.1);
    }

    // --- State & Layout Configuration ---
    const state = {
      cans: 0,
      maxCans: 10,
      drb: 0,
      gear: 5, // held GEAR — start with 5 for door playtest; vault still grants more
      inTruck: true, // start driving the truck
      gearVaultCooldown: 0, // 3-second global cooldown on gear vault
      oilTankCooldown: 0, // 2-second pad trigger debouncer
      vaultPool: 450000,
      currentAction: null,
      currentDoor: null, // nearest bay for gear-door interact
      keys: { up: false, down: false, left: false, right: false },
      touchDrive: {
        active: false,
        pointerId: null,
        startSX: 0,
        startSY: 0,
        curSX: 0,
        curSY: 0,
        moved: false
      },
      rampCooldown: 0
    };

    // ===================================================================
    // SEEDED DET CORE (Gear Mill style): mulberry32 streams, fixed 60Hz
    // tick, input/event log, FNV-1a replay hash. Same seed + same log
    // => same hash. Nothing here calls a contract — earnings are PENDING.
    // ===================================================================
    const TICK = 1 / 60;
    const DET_VERSION = 'caps-garage-det-2';
    const STASH_CAP = 3;
    function fnv1a(str, h) {
      h = (h == null ? 0x811c9dc5 : h) >>> 0;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h >>> 0;
    }
    function mulberry32(a) {
      a = a >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0; let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // Independent sub-streams so oil/doors/poles/BYTE never shift each other.
    function subRng(label) { return mulberry32(fnv1a(det.seed + '|' + label)); }
    function parseSeed(v) {
      if (v == null || v === '') return null;
      return /^\d+$/.test(String(v)) ? (Number(v) >>> 0) : fnv1a(String(v));
    }
    function freshLedger() {
      return {
        pendingGear: 0,   // door prizes, unclaimed (trap-able)
        pendingByte: 0,   // BYTE gears proven by a pole repair, unclaimed (trap-able)
        stash: 0,         // BYTE gears carried, not yet installed (trap-able)
        bankedGear: 0,    // banked at the deposit pad (future claim, no payout yet)
        bankedDrb: 0,     // DRB from VERIFIED oil deposits
        lostGear: 0, lostCans: 0,
        carried: [],      // oil cans carried: {id, t, x, y}
        repairs: [],      // proof of play: {pole, t}
        handoffs: [],     // BYTE handoffs: {n, t}
        doors: [],        // first reveals: {door, t, kind, amt|trap}
        deposits: [],     // {t, cans, oilOk, reason, gear}
        rig: 0            // test-rig/cheat uses this session
      };
    }
    const det = {
      seed: 0, seedLabel: '', tick: 0, log: [], pending: [], lastIn: '',
      replaying: false, canWave: 0, canLayout: {}, deposited: {}, lastDepT: 0,
      led: freshLedger()
    };
    let simIn = [0, 0, 0, 0, 0, 0, 0];
    // Dev/level-editor state (logic lives in dev.js). Sim is paused while dev.on.
    const dev = { on: false, cam: { x: 0, y: 0, z: 1 } }; // up,down,left,right,touch,dragX,dragY

    // --- Canvas & Radar Setup ---
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const radarCanvas = document.getElementById('radar-canvas');
    const radarCtx = radarCanvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resize() {
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width = width;
      canvas.height = height;

      radarCanvas.width = radarCanvas.parentElement.clientWidth;
      radarCanvas.height = radarCanvas.parentElement.clientHeight - 20;
    }
    window.addEventListener('resize', resize);
    resize();

    // --- Yard Geometry: 5 Rows of 100 Garages + Dirt Roads ---
    // Dirt roads are a little wider than the SUV:
    // SUV width: 44px, Dirt Road height: 72px (comfortable clearance).
    const garageRows = 5;
    const garagesPerRow = 100;
    const garageW = 54;
    const garageH = 64;
    const dirtRoadH = 72; // A little wider than SUV (44px)
    const yardStartX = 500;
    const yardStartY = 200;

    // Calculate row Y positions
    // Row 0: garageY, then Road 0, then Row 1, then Road 1...
    const rows = [];
    for (let r = 0; r < garageRows; r++) {
      const gY = yardStartY + r * (garageH + dirtRoadH);
      const roadY = gY + garageH; // dirt road directly beneath this garage row
      rows.push({
        rowIndex: r,
        garageY: gY,
        roadY: roadY,
        roadH: dirtRoadH
      });
    }

    const yardEndX = yardStartX + garagesPerRow * garageW; // 500 + 5400 = 5900px
    const world = {
      width: yardEndX + 1000, // room for Oil Tank at the end of the garage yard
      height: yardStartY + garageRows * (garageH + dirtRoadH) + 300
    };

    // Build the 500 Garages (5 rows of 100 garages)
    const garages = [];
    for (let r = 0; r < garageRows; r++) {
      for (let c = 0; c < garagesPerRow; c++) {
        const id = r * garagesPerRow + c + 1;
        garages.push({
          id: id,
          row: r,
          col: c,
          x: yardStartX + c * garageW,
          y: rows[r].garageY,
          w: garageW - 4, // 50px wide garage bay with 4px wall gap
          h: garageH,
          doorOpen: false // all bays start CLOSED — Cap gears them open (incl. #42)
        });
      }
    }

    // --- The Blue SUV inside Bay #42 ---
    // "there is a blue suv inside a garage with just the front hanging out a little
    // without overlapping any object that could come in contact with it.
    // so if were driving the truck down the dirt road we wont be running into another suv."
    const blueBay = garages.find(g => g.id === 42) || garages[41];
    // Bay 42 is in Row 0 (faces Road 0 at roadY).
    // SUV length: 56px, width: 36px.
    // Parked inside: nose peeks out ~5px into threshold lip.
    // Dirt road begins 6px lower and center is +36px away, zero overlap with dirt road driving corridor!
    const blueSUV = {
      x: blueBay.x + (blueBay.w / 2),
      y: blueBay.y + blueBay.h - 18, // body inside garage, nose peeks out ~5px into threshold lip
      w: 36,
      length: 56,
      heading: Math.PI / 2 // facing DOWN toward the door
    };

    // --- Gate: STREET (west) vs PARKING LOT (yard) ---
    const gateX = yardStartX - 18;
    const gate = {
      x: gateX,
      y: yardStartY - 20,
      h: garageRows * (garageH + dirtRoadH) + 40,
      postW: 14
    };

    // --- Teal-green road-blocker SUVs on dirt corridors (Cap allowlist ONLY) ---
    // Hard-block the red truck; leave a thin south-edge walk lane for on-foot squeeze-past.
    // No Road-0 choke wall / no extras beyond the listed bay-pair corridors.
    function bayById(id) {
      return garages.find(g => g.id === id);
    }
    function roadYBetween(a, b) {
      const ra = Math.min(a.row, b.row);
      return rows[ra].roadY + dirtRoadH / 2;
    }
    function midXBetween(a, b) {
      return (a.x + a.w / 2 + b.x + b.w / 2) / 2;
    }

    // Full Cap allowlist — one pair of blockers per corridor (single SUV mid-road).
    // Cap: no green under #100 (ramp replaces 100↔200); no greens on bottom dirt road (Road 4).
    const greenPairIds = [
      [1, 101], [110, 210], [230, 330], [344, 444], [262, 362],
      [63, 163], [84, 184], [395, 495], [400, 300]
    ];

    const greenSUVs = [];
    function pushGreen(x, y, tag) {
      greenSUVs.push({
        x, y,
        // N-S nearly fills the 72px dirt road; ~12px south walk lane remains for foot traffic.
        // Sized vs truck body (player.h≈34) so driving cannot slip the edge.
        w: 58,
        length: 56,  // E-W
        heading: 0,
        tag: tag || 'blocker',
        blockVehicle: true,
        blockWalk: false // walk uses narrow AABB + south-edge gap instead
      });
    }

    greenPairIds.forEach(([idA, idB]) => {
      const a = bayById(idA);
      const b = bayById(idB);
      if (!a || !b) return;
      // Bias slightly north so the south edge of the road is the walk squeeze lane
      const gy = roadYBetween(a, b) - 6;
      // Strict: never place corridor greens on bottom dirt road (Road 4 under 401–500)
      if (gy >= rows[4].roadY && gy <= rows[4].roadY + dirtRoadH) return;
      pushGreen(midXBetween(a, b), gy, idA + '-' + idB);
    });

    // --- Oil Tank & Deposit Pad at the end of the garage yard ---
    const oilTank = {
      x: yardEndX + 220,
      y: yardStartY + (garageRows * (garageH + dirtRoadH)) / 2 - 20,
      radius: 65,
      height: 120
    };

    // The Truck Deposit Pad: situated directly in front of the Oil Tank
    const depositPad = {
      x: yardEndX + 60,
      y: oilTank.y - 50,
      w: 120,
      h: 100,
      activeTimer: 0
    };

    // --- Fenced oil-tank yard (seals parking-lot approaches for BOTH modes) ---
    // Compound encloses pad + tank. West/north/south walls are solid (no lot-edge gaps).
    // East wall has a single gate so pad/vault stay reachable by looping around — not from the lot.
    const oilYard = {
      x: yardEndX + 30,
      y: oilTank.y - 145,
      w: 360,
      h: 290,
      wallT: 10,
      gateGap: 78 // east entrance opening (centered on pad)
    };
    const oilFenceSegs = (() => {
      const o = oilYard;
      const t = o.wallT;
      const gateCy = depositPad.y + depositPad.h / 2;
      const gateTop = gateCy - o.gateGap / 2;
      const gateBot = gateCy + o.gateGap / 2;
      return [
        // West wall — seals parking-lot / east-avenue approach (NO gaps)
        { x: o.x, y: o.y, w: t, h: o.h, tag: 'west' },
        // North wall
        { x: o.x, y: o.y, w: o.w, h: t, tag: 'north' },
        // South wall
        { x: o.x, y: o.y + o.h - t, w: o.w, h: t, tag: 'south' },
        // East wall split around gate
        { x: o.x + o.w - t, y: o.y, w: t, h: Math.max(0, gateTop - o.y), tag: 'east-n' },
        { x: o.x + o.w - t, y: gateBot, w: t, h: Math.max(0, o.y + o.h - gateBot), tag: 'east-s' }
      ];
    })();

    // --- Bottom wall: full garage length between southernmost dirt road & lot/street ---
    // Solid collision for BOTH truck and walk. Visual barrier (not invisible).
    const bottomWall = {
      x: yardStartX,
      y: rows[4].roadY + dirtRoadH, // flush under Road 4 (southernmost bay-row dirt road)
      w: yardEndX - yardStartX,
      h: 14,
      tag: 'bottom-garage-wall'
    };

    // --- Bottom E-W STREET (south of wall): asphalt + yellow dashes + curbs ---
    // Replaces the old dark void / south-apron look with the same language as west STREET.
    const bottomStreet = {
      x: gate.x,
      y: bottomWall.y + bottomWall.h,
      w: world.width - gate.x - 20,
      h: 110
    };
    // Ensure world fits the new south street band
    world.height = Math.max(world.height, bottomStreet.y + bottomStreet.h + 80);

    // --- Extra pile: 8 teal SUVs just RIGHT of bay #500 (south approach) ---
    // Cap ask: bay 500 door/approach stays accessible; pile sits immediately to the right
    // so it still clogs the bottom approach between 500 and the street/wall.
    // Same green rules (truck hard-block, walk may squeeze). EXTRA to the 10 corridor allowlist.
    (function placeBay500GreenPile() {
      const bay500 = bayById(500);
      if (!bay500) return;
      // Just east of bay 500 — half-length (28) clears the bay east edge / door corridor
      const baseX = bay500.x + bay500.w + 36;
      // Sit in the south approach: between bay/road and the bottom wall
      const baseY = bottomWall.y - 28;
      // Bias offsets east/clustered right of bay (no leftward spill into door approach)
      const offsets = [
        [0, 0], [30, -12], [16, 18], [44, 4], [10, -24],
        [54, -6], [36, 16], [24, -2]
      ];
      offsets.forEach((off, i) => {
        pushGreen(baseX + off[0], baseY + off[1], 'pile500-' + (i + 1));
      });
    })();

    // --- LIGHT POLES: one every 10 bays (after #10, #20 … #500) = 50 poles ---
    const poles = []; // filled from the level layout (applyLayout)
    function defaultPolePositions() {
      const out = [];
      for (let r = 0; r < garageRows; r++) for (let k = 0; k < 10; k++) {
        const c = k * 10 + 9;
        out.push({ x: yardStartX + (c + 1) * garageW - 2, y: rows[r].roadY + 6 });
      }
      return out;
    }
    function seedPoles() {
      const rr = subRng('poles');
      poles.forEach(p => { p.on = rr() >= 0.6; }); // ~60% start OFF
    }

    // --- Door contents (seeded shuffle of the fixed 500-door table) ---
    function buildDoorTable() {
      const t = [];
      const add = (n, o) => { for (let i = 0; i < n; i++) t.push(o); };
      add(100, { kind: 'prize', amt: 2 });
      add(50, { kind: 'prize', amt: 5 });
      add(25, { kind: 'prize', amt: 10 });
      add(5, { kind: 'prize', amt: 25 });
      add(1, { kind: 'prize', amt: 100 });
      add(40, { kind: 'trap', trap: 'spill' });
      add(40, { kind: 'trap', trap: 'drop' });
      add(20, { kind: 'trap', trap: 'block' });
      while (t.length < garages.length) t.push({ kind: 'empty' });
      const rr = subRng('doors');
      for (let i = t.length - 1; i > 0; i--) {
        const j = Math.floor(rr() * (i + 1));
        const x = t[i]; t[i] = t[j]; t[j] = x;
      }
      garages.forEach((g, i) => { g.content = t[i]; g.revealed = false; });
    }

    // Broken-gear piles dumped by 'block' traps: stop the SUV, walker passes.
    const debris = [];
    let spills = [];

    // --- Broken-down vehicle maze between the ramp landing and the oil-yard gate ---
    // Route (SUV): land from #100 ramp → north strip slalom → NE gap → east room →
    // SE gap → bottom corridor slalom → SW gap → gate pocket → east gate → pad.
    // Verified solvable by routeCheck() (grid BFS on the real collision fn).
    const wrecks = [];  // filled from the level layout
    const crates = [];
    const gearPicks = [];
    const WRECK_COLS = ['#7c2d12', '#57534e', '#9a3412', '#3f6212', '#713f12', '#475569'];
    function defaultWrecks() {
      const out = [];
      const RX = yardEndX + 30; // rightSealX
      const ox = RX + 360;      // oil-yard east wall outer x
      const E = world.width - 24 - 10; // inner face of right-east fence
      let n = 0;
      const car = (x, y, w, h) => out.push({ x, y, w, h, z: 0, c: (n++) % 6 });
      // North strip slalom
      car(RX + 270, yardStartY - 40, 44, 56, 'n1');
      car(RX + 270, yardStartY + 16, 44, 44, 'n2');
      car(RX + 520, yardStartY + 100, 60, 40, 'n3');
      car(RX + 580, yardStartY + 100, 60, 40, 'n4');
      // W1: seals the gate pocket from the north (gap at far east)
      for (let x = ox; x + 60 <= E - 96; x += 60) car(x, 410, 60, 40, 'w1');
      // W3: splits gate pocket from east room
      for (let y = 450; y < 690; y += 60) car(ox + 130, y, 40, 60, 'w3');
      // W2: south of east room (gaps at far west + far east)
      for (let x = ox + 90; x + 60 <= E - 96; x += 60) car(x, 690, 60, 40, 'w2');
      // Bottom corridor slalom
      car(ox + 310, 730, 40, 46, 'b1'); car(ox + 310, 776, 40, 44, 'b2');
      car(ox + 160, 820, 40, 54, 'b3');
      return out;
    }

    // --- BYTE the dog: brings a gear on a SEEDED timer ---
    const byteHome = { x: yardStartX + 40, y: rows[4].roadY + 18 };
    const byte = { x: byteHome.x, y: byteHome.y, carrying: false, nextT: 0, count: 0, face: 1 };
    function byteInterval(n) {
      const rr = mulberry32(fnv1a(det.seed + '|byte|' + n));
      return (n === 0 ? 180 : 360) + Math.floor(rr() * 480); // 3–11s first, then 6–14s
    }

    // --- Right-side dead-zone fence (yard/lot sealed; does NOT cross bottom street) ---
    // Mirrors the top fence: runs along the YARD perimeter from the end of the south wall
    // eastward — not across asphalt street. South street stays drivable/walkable.
    // Oil compound mid-band west wall stays the lot seal; east gate still the compound entry.
    const rightFenceT = 10;
    const rightSealX = oilYard.x; // flush with oil-yard west fence line
    const rightSealRight = world.width - 24;
    const rightFenceSegs = (() => {
      const t = rightFenceT;
      // Match render() streetTop = yardStartY - 50
      const northY = yardStartY - 50;
      // Yard south edge = south face of bottom wall (street begins below — do NOT fence across it)
      const yardSouthEdge = bottomWall.y + bottomWall.h;
      const oilTop = oilYard.y;
      const oilBot = oilYard.y + oilYard.h;
      return [
        // West — top parking → oil north (seal lot-edge north bypass)
        { x: rightSealX, y: northY, w: t, h: Math.max(0, oilTop - northY), tag: 'right-west-top' },
        // West — oil south → end of bottom/south wall (yard edge only; street stays open)
        { x: rightSealX, y: oilBot, w: t, h: Math.max(0, yardSouthEdge - oilBot), tag: 'right-west-bot' },
        // North run — along top yard/lot edge to end of right side
        { x: rightSealX, y: northY, w: rightSealRight - rightSealX, h: t, tag: 'right-north' },
        // South run — from end of south wall along yard edge (NOT across bottom street)
        { x: rightSealX, y: yardSouthEdge - t, w: rightSealRight - rightSealX, h: t, tag: 'right-south' },
        // East closer — end of the right side (yard height only)
        { x: rightSealRight - t, y: northY, w: t, h: yardSouthEdge - northY, tag: 'right-east' }
      ];
    })();

    // --- West front walls (STREET → yard): only enter through the GATE ---
    // Close fence/wall gaps north & south of the gate on the yard west face so drive/walk
    // cannot slip into the parking lot from the west STREET except via the gate opening.
    const westFrontWallT = 12;
    // Gate opening = bottom dirt road (Road 4) band only — walls seal every other west entry
    const westFrontNorthY = yardStartY - 50; // match streetTop / north apron
    const westFrontSouthY = bottomWall.y + bottomWall.h; // end of south wall / yard edge
    const westGateTop = rows[4].roadY;
    const westGateBot = Math.min(rows[4].roadY + dirtRoadH, westFrontSouthY);
    const westGateCy = (westGateTop + westGateBot) / 2;
    const westGateGap = westGateBot - westGateTop;
    const westFrontWallSegs = [
      { x: gate.x, y: westFrontNorthY, w: westFrontWallT, h: Math.max(0, westGateTop - westFrontNorthY), tag: 'west-front-n' },
      { x: gate.x, y: westGateBot, w: westFrontWallT, h: Math.max(0, westFrontSouthY - westGateBot), tag: 'west-front-s' }
    ];

    // --- Top street (north of yard) + north yard fence (jump target for ramps) ---
    const northFence = {
      x: gate.x,
      y: (yardStartY - 50) - 12, // just above parking apron / streetTop
      w: rightSealRight - gate.x,
      h: 12,
      tag: 'north-yard-fence'
    };
    const topStreet = {
      x: 0,
      y: 24,
      w: world.width,
      h: Math.max(40, northFence.y - 24)
    };

    // Combined solid barriers (truck + walk): bottom + right fence + west front + north fence
    const solidBarriers = [
      { x: bottomWall.x, y: bottomWall.y, w: bottomWall.w, h: bottomWall.h, tag: bottomWall.tag },
      ...rightFenceSegs,
      ...westFrontWallSegs,
      { x: northFence.x, y: northFence.y, w: northFence.w, h: northFence.h, tag: northFence.tag }
    ];

    // --- Fence-jump ramps (red SUV / inTruck only) ---
    // Loop: Road 0 under #100 → restricted east yard → return ramp → TOP STREET
    // (removed old yard-right + Road-1/#200 east ramps)
    const jumpLandY = topStreet.y + topStreet.h * 0.55;
    const bay100Ramp = bayById(100);
    const ramp100Cx = bay100Ramp ? (bay100Ramp.x + bay100Ramp.w / 2) : (yardEndX - 29);
    const ramps = []; // filled from the level layout
    const RAMP_FACE = { 0: 'east', 90: 'south', 180: 'west', 270: 'north' };
    function defaultRamps() {
      return [
        { x: ramp100Cx, y: rows[0].roadY + 38, rot: 0, d: Math.round(rightSealX + 110 - ramp100Cx), label: 'RAMP → RESTRICTED' },
        { x: rightSealX + 100, y: yardStartY - 18, rot: 270, d: Math.round(yardStartY - 18 - jumpLandY), label: 'RAMP → TOP' }
      ];
    }
    function builtinLayout() {
      const RX = rightSealX;
      return {
        v: 1, id: 'yard-1', name: 'The Yard (default)',
        wrecks: defaultWrecks(),
        crates: [
          { x: RX + 16, y: yardStartY + 140, z: 0 }, { x: RX + 16, y: yardStartY + 140, z: 1 }, { x: RX + 46, y: yardStartY + 140, z: 0 },
          { x: RX + 16, y: 840, z: 0 }, { x: RX + 16, y: 840, z: 1 }, { x: RX + 16, y: 840, z: 2 }
        ],
        ramps: defaultRamps(),
        gears: [{ x: yardStartX + 200, y: rows[4].roadY + 36 }, { x: RX + 420, y: 600 }, { x: yardStartX + 2600, y: rows[2].roadY + 36 }],
        poles: defaultPolePositions()
      };
    }
    function normLayout(L) {
      const n = (v) => Math.round(Number(v) || 0);
      const out = {
        v: 1, area: L.area === 'yard' ? 'yard' : 'garage', id: String(L.id || 'custom').slice(0, 40), name: String(L.name || 'Custom level').slice(0, 60),
        wrecks: (L.wrecks || []).map(w => ({ x: n(w.x), y: n(w.y), w: Math.max(16, n(w.w) || 60), h: Math.max(16, n(w.h) || 40), z: Math.max(0, n(w.z)), c: n(w.c) % 6 })),
        crates: (L.crates || []).map(c => ({ x: n(c.x), y: n(c.y), z: Math.max(0, n(c.z)) })),
        ramps: (L.ramps || []).map(r => ({ x: n(r.x), y: n(r.y), rot: (((Math.round(n(r.rot) / 90) * 90) % 360) + 360) % 360, d: Math.max(60, Math.min(600, n(r.d) || 200)), label: r.label ? String(r.label).slice(0, 30) : '' })),
        gears: (L.gears || []).map(g => ({ x: n(g.x), y: n(g.y) })),
        poles: (L.poles || []).map(p => ({ x: n(p.x), y: n(p.y) }))
      };
      return out;
    }
    function layoutHashOf(L) { const j = JSON.stringify(normLayout(L)); return fnv1a(j).toString(16).padStart(8, '0') + fnv1a(j, 0x5bd1e995).toString(16).padStart(8, '0'); }
    function rampGeom(r) {
      const vert = r.rot === 90 || r.rot === 270;
      const w = vert ? 48 : 58, h = vert ? 58 : 48;
      const a = r.rot * Math.PI / 180;
      return { cx: r.x, cy: r.y, rot: r.rot, d: r.d, x: r.x - w / 2, y: r.y - h / 2, w, h, face: RAMP_FACE[r.rot],
        landX: Math.round(r.x + Math.cos(a) * r.d), landY: Math.round(r.y + Math.sin(a) * r.d),
        label: r.label || 'RAMP', landToast: '🛻 Ramp jump!' };
    }
    // ---- Two level AREAS: 'yard' (restricted/oil-tank yard, x >= rightSealX) and 'garage' (rows + lot + streets)
    function areaOf(x) { return x >= rightSealX - 10 ? 'yard' : 'garage'; }
    function builtinLevels() {
      const B = normLayout(builtinLayout());
      const mk = (area, id, name) => ({
        v: 1, area, id, name,
        wrecks: B.wrecks.filter(w => areaOf(w.x + w.w / 2) === area),
        crates: B.crates.filter(c => areaOf(c.x + 14) === area),
        ramps: B.ramps.filter(r => areaOf(r.x) === area),
        gears: B.gears.filter(g => areaOf(g.x) === area),
        poles: B.poles.filter(p => areaOf(p.x) === area)
      });
      return { yard: mk('yard', 'yard-1', 'The Yard (default)'), garage: mk('garage', 'garage-1', 'Garage Rows (default)') };
    }
    // Combine one yard level + one garage level into the live world. Both hashes enter the replay hash.
    function applyLevels(Y, G) {
      const b = (Y && G) ? null : builtinLevels();
      const y = normLayout(Object.assign({}, Y || b.yard, { area: 'yard' }));
      const g = normLayout(Object.assign({}, G || b.garage, { area: 'garage' }));
      det.levels = { yard: y, garage: g };
      const comb = { id: y.id + '+' + g.id, name: y.name + ' + ' + g.name };
      ['wrecks', 'crates', 'ramps', 'gears', 'poles'].forEach(k => { comb[k] = g[k].concat(y[k]); });
      applyLayout(comb);
      det.levelHash = { yard: layoutHashOf(y), garage: layoutHashOf(g) };
      det.layoutHash = det.levelHash.yard + '.' + det.levelHash.garage;
    }
    // Rebuild live world objects from a level layout (also used by dev mode preview)
    function applyLayout(L) {
      const N = normLayout(L);
      det.layout = N; det.layoutHash = layoutHashOf(N);
      wrecks.length = 0; N.wrecks.forEach(w => wrecks.push({ x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, col: WRECK_COLS[w.c] }));
      crates.length = 0; N.crates.forEach(c => crates.push({ x: c.x, y: c.y, w: 28, h: 28, z: c.z }));
      ramps.length = 0; N.ramps.forEach(r => ramps.push(rampGeom(r)));
      poles.length = 0; N.poles.forEach((p, i) => poles.push({ id: i + 1, x: p.x, y: p.y, on: true }));
      gearPicks.length = 0; N.gears.forEach((g, i) => gearPicks.push({ id: i, x: g.x, y: g.y, taken: false }));
    }

    // Player Truck
    const player = {
      x: yardStartX - 100,
      y: rows[4].roadY + dirtRoadH / 2, // start on bottom Dirt Road 4 (gate)
      speed: 3.5,
      truckSpeed: 6.8,
      w: 58,
      h: 34,
      heading: 0,
      trail: [],
      jump: null // { t, dur, x0,y0,x1,y1 }
    };

    // Oil Cans scattered down the dirt roads
    let oilCans = [];
    function spawnCans() {
      // Seeded wave: layout = f(seed, wave). Verified only when oil is deposited.
      oilCans = [];
      const rr = subRng('oil:' + det.canWave);
      const layout = {};
      let slot = 0;
      for (let r = 0; r < garageRows - 1; r++) {
        const roadCenterY = rows[r].roadY + dirtRoadH / 2;
        for (let c = 5; c < garagesPerRow - 5; c += 4) {
          const skip = rr() < 0.2;
          const x = yardStartX + c * garageW + Math.floor(rr() * 20);
          const y = roadCenterY + Math.floor(rr() * 20 - 10);
          const id = det.canWave * 1000 + slot++;
          if (skip) continue;
          layout[id] = { x, y };
          oilCans.push({ id, x, y, bobble: (id % 97) * 0.37 });
        }
      }
      det.canLayout[det.canWave] = layout;
    }

    // Floating deposit particles
    let particles = [];

    // --- Toast Helper ---
    let toastTimeout = null;
    function showToast(msg) {
      if (det.replaying) return;
      const el = document.getElementById('toast');
      el.innerText = msg;
      el.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        el.classList.remove('show');
      }, 3500);
    }

    // --- Listeners ---
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') state.keys.up = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.keys.down = true;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keys.right = true;
      if (e.key === 'e' || e.key === 'E' || e.key === ' ') {
        e.preventDefault();
        triggerCurrentAction();
      }
    });

    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') state.keys.up = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.keys.down = false;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keys.right = false;
    });

    // Screen → world (camera centered on player)
    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: sx - width / 2 + player.x,
        y: sy - height / 2 + player.y,
        sx, sy
      };
    }

    function touchHitRadius() {
      return state.inTruck ? 48 : 28;
    }

    function endTouchDrive(pointerId) {
      const td = state.touchDrive;
      if (!td.active) return;
      if (pointerId != null && td.pointerId != null && pointerId !== td.pointerId) return;
      td.active = false;
      td.pointerId = null;
      td.moved = false;
    }

    // Touch-on-object drive (primary mobile). Small move threshold so desktop
    // click-inspect / UI clicks are not stolen as drive gestures.
    canvas.addEventListener('pointerdown', e => {
      if (dev.on) return;
      if (e.button != null && e.button !== 0) return;
      const wpt = screenToWorld(e.clientX, e.clientY);
      if (Math.hypot(wpt.x - player.x, wpt.y - player.y) > touchHitRadius()) return;
      const td = state.touchDrive;
      td.active = true;
      td.pointerId = e.pointerId;
      td.startSX = wpt.sx;
      td.startSY = wpt.sy;
      td.curSX = wpt.sx;
      td.curSY = wpt.sy;
      td.moved = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', e => {
      const td = state.touchDrive;
      if (!td.active || e.pointerId !== td.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      td.curSX = e.clientX - rect.left;
      td.curSY = e.clientY - rect.top;
      if (Math.hypot(td.curSX - td.startSX, td.curSY - td.startSY) > 10) td.moved = true;
      e.preventDefault();
    });

    function onPointerEnd(e) { endTouchDrive(e.pointerId); }
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('lostpointercapture', e => endTouchDrive(e.pointerId));

    // --- Actions ---
    function toggleGarageDoor(g) {
      if (state.inTruck) {
        showToast('Hop out to use a GEAR on bay doors.');
        playTone(220, 'sawtooth', 0.12);
        return;
      }
      if (!g) return;
      if (state.gear < 1) {
        showToast('⚙️ Need a GEAR to open/close this door.');
        playTone(200, 'sawtooth', 0.15);
        return;
      }
      state.gear -= 1;
      g.doorOpen = !g.doorOpen;
      updateHUD();
      if (g.doorOpen && !g.revealed) { revealDoor(g); return; }
      if (g.doorOpen) {
        playTone(640, 'square', 0.12);
        setTimeout(() => playTone(820, 'triangle', 0.1), 60);
        showToast(`⚙️ Bay #${g.id} OPEN (−1 GEAR). Truck & walk can pass.`);
      } else {
        playTone(320, 'sawtooth', 0.14);
        showToast(`⚙️ Bay #${g.id} CLOSED (−1 GEAR).`);
      }
    }

    // Door reveal: prizes go to PENDING; traps wipe pending BEFORE any claim.
    function revealDoor(g) {
      g.revealed = true;
      const L = det.led;
      const c = g.content || { kind: 'empty' };
      const rec = { door: g.id, t: det.tick, kind: c.kind };
      if (c.kind === 'prize') {
        L.pendingGear += c.amt; rec.amt = c.amt;
        playTone(880, 'square', 0.1); setTimeout(() => playTone(1180, 'triangle', 0.15), 80);
        showToast(`🎁 Bay #${g.id}: +${c.amt} GEAR (pending — bank it at the Oil Tank pad)`);
      } else if (c.kind === 'trap') {
        rec.trap = c.trap;
        playTone(140, 'sawtooth', 0.35, 0.15);
        if (c.trap === 'spill') {
          rec.lost = L.carried.length;
          L.lostCans += L.carried.length;
          for (let i = 0; i < L.carried.length; i++) spills.push({ x: player.x - 20 + (i * 9) % 40, y: player.y + (i % 3) * 6 - 6 });
          L.carried = []; state.cans = 0;
          showToast(`☠️ TRAP Bay #${g.id}: oil spill! Lost ${rec.lost} cans.`);
        } else if (c.trap === 'drop') {
          rec.lost = L.pendingGear + L.pendingByte + L.stash;
          L.lostGear += rec.lost;
          L.pendingGear = 0; L.pendingByte = 0; L.stash = 0;
          showToast(`☠️ TRAP Bay #${g.id}: dropped ALL earned gears (−${rec.lost} pending).`);
        } else {
          const rw = rows[g.row];
          debris.push({ x: g.x - 6, y: rw.roadY + 2, w: g.w + 12, h: dirtRoadH - 4, door: g.id });
          showToast(`☠️ TRAP Bay #${g.id}: broken gears pour out! SUV can't pass — walk it.`);
        }
      } else {
        showToast(`⚙️ Bay #${g.id} OPEN — empty bay.`);
      }
      L.doors.push(rec);
      updateHUD();
    }

    function repairPole(p) {
      const L = det.led;
      if (state.inTruck) { showToast('Hop out to fix the lamp generator.'); return; }
      if (!p || p.on) return;
      if (L.stash < 1) { showToast('🦴 No stashed BYTE gear — wait for BYTE to bring one.'); playTone(200, 'sawtooth', 0.12); return; }
      L.stash -= 1; L.pendingByte += 1; p.on = true;
      L.repairs.push({ pole: p.id, t: det.tick });
      playTone(700, 'triangle', 0.1); setTimeout(() => playTone(1040, 'sine', 0.2), 90);
      showToast(`💡 Lamp #${p.id} fixed! BYTE gear proven → +1 GEAR pending.`);
      updateHUD();
    }

    function doTriggerCurrentAction() {
      if (state.currentAction === 'repair_pole') { repairPole(state.currentPole); return; }
      if (state.currentAction === 'inspect_blue_suv') {
        showToast("Not broke, just unused...");
        playTone(520, 'sine', 0.15);
      } else if (state.currentAction === 'inspect_green_suv') {
        showToast("broke down, dont even try...");
        playTone(180, 'sawtooth', 0.18);
      } else if (state.currentAction === 'gear_door') {
        toggleGarageDoor(state.currentDoor);
      } else if (state.currentAction === 'claim_gear_vault') {
        doClaimGearVault();
      } else if (state.currentAction === 'toggle_truck') {
        doToggleTruck();
      }
    }
    // UI entry points only QUEUE events; they apply at the next fixed tick and are logged.
    function queueAct(k, n) { det.pending.push(n == null ? { k } : { k, n }); }
    function triggerCurrentAction() { queueAct('act'); }
    function testClaimGearVault() { queueAct('vault'); }
    function testToggleTruck() { queueAct('truck'); }
    function testGiveCans(n) { queueAct('cans', n); }
    function warpToPad() { queueAct('warp_pad'); }
    function warpToBlueSUV() { queueAct('warp_blue'); }
    function resetPlayerPosition() { queueAct('reset'); }
    function applyAct(a) {
      switch (a.k) {
        case 'act': doTriggerCurrentAction(); break;
        case 'vault': det.led.rig++; doClaimGearVault(); break;
        case 'truck': doToggleTruck(); break;
        case 'cans': det.led.rig++; doGiveCans(a.n | 0); break;
        case 'warp_pad': det.led.rig++; doWarpToPad(); break;
        case 'warp_blue': det.led.rig++; doWarpToBlueSUV(); break;
        case 'reset': doResetPlayerPosition(); break;
      }
    }

    function findNearestDoor(maxDist) {
      let best = null;
      let bestD = maxDist;
      for (let i = 0; i < garages.length; i++) {
        const g = garages[i];
        const doorCx = g.x + g.w / 2;
        if (Math.abs(player.x - doorCx) > maxDist + 20) continue;
        // Doors work from BOTH sides: south lip (front road) or north face (back road)
        const d = Math.min(Math.hypot(player.x - doorCx, player.y - (g.y + g.h)), Math.hypot(player.x - doorCx, player.y - g.y));
        if (d < bestD) { bestD = d; best = g; }
      }
      return best;
    }

    function garageBlocksAt(nx, ny, halfW, halfH) {
      // Per-bay: closed door = solid; open door = passable corridor
      const pad = 2;
      for (let i = 0; i < garageRows; i++) {
        const r = rows[i];
        if (ny + halfH < r.garageY - pad || ny - halfH > r.garageY + garageH + pad) continue;
        if (nx + halfW < yardStartX - pad || nx - halfW > yardEndX + pad) continue;
        const colStart = Math.max(0, Math.floor((nx - halfW - yardStartX) / garageW) - 1);
        const colEnd = Math.min(garagesPerRow - 1, Math.floor((nx + halfW - yardStartX) / garageW) + 1);
        for (let c = colStart; c <= colEnd; c++) {
          const g = garages[i * garagesPerRow + c];
          if (!g) continue;
          if (nx + halfW > g.x && nx - halfW < g.x + g.w &&
              ny + halfH > g.y && ny - halfH < g.y + g.h) {
            if (!g.doorOpen) return true;
          }
        }
      }
      return false;
    }

    function rectHit(nx, ny, hw, hh, r) {
      return nx + hw > r.x && nx - hw < r.x + r.w && ny + hh > r.y && ny - hh < r.y + r.h;
    }
    // Single collision function — used by play AND by routeCheck() BFS.
    function collidesAt(nx, ny, halfW, halfH, inTruck, cx, cy) {
      if (garageBlocksAt(nx, ny, halfW, halfH)) return true;
      // Green road blockers: HARD-block truck; walk may squeeze south-edge lane
      for (let gi = 0; gi < greenSUVs.length; gi++) {
        const s = greenSUVs[gi];
        if (inTruck && !s.blockVehicle) continue;
        const left = s.x - s.length / 2, right = s.x + s.length / 2;
        const top = s.y - s.w / 2, bottom = s.y + s.w / 2;
        if (nx + halfW > left && nx - halfW < right && ny + halfH > top && ny - halfH < bottom) return true;
      }
      for (let fi = 0; fi < oilFenceSegs.length; fi++) if (rectHit(nx, ny, halfW, halfH, oilFenceSegs[fi])) return true;
      for (let bi = 0; bi < solidBarriers.length; bi++) if (rectHit(nx, ny, halfW, halfH, solidBarriers[bi])) return true;
      // Broken-down vehicle maze: blocks SUV and walker
      for (let wi = 0; wi < wrecks.length; wi++) if (rectHit(nx, ny, halfW, halfH, wrecks[wi])) return true;
      for (let ci = 0; ci < crates.length; ci++) if (rectHit(nx, ny, halfW, halfH, crates[ci])) return true;
      // Broken-gear trap piles: SUV only; never trap a truck already inside one
      if (inTruck) {
        for (let di = 0; di < debris.length; di++) {
          const d = debris[di];
          if (rectHit(nx, ny, halfW, halfH, d) && !(cx != null && rectHit(cx, cy, halfW, halfH, d))) return true;
        }
      }
      return false;
    }

    // Oil path check — runs ONLY when oil is deposited. Each can must exist in the
    // seeded wave layout, not be reused, be picked within reach, and consecutive
    // pickups must be reachable at max SUV speed (+ramp allowance).
    function verifyOilPath(carried) {
      let prevT = det.lastDepT, prev = null;
      for (let i = 0; i < carried.length; i++) {
        const c = carried[i];
        if (c.id < 0) return { ok: false, reason: 'rig cans (no seed id)' };
        const wave = Math.floor(c.id / 1000);
        const spot = det.canLayout[wave] && det.canLayout[wave][c.id];
        if (!spot) return { ok: false, reason: 'can ' + c.id + ' not in seed' };
        if (det.deposited[c.id]) return { ok: false, reason: 'can ' + c.id + ' reused' };
        if (Math.hypot(c.x - spot.x, c.y - spot.y) > 40) return { ok: false, reason: 'can ' + c.id + ' out of reach' };
        if (prev && Math.hypot(spot.x - prev.x, spot.y - prev.y) > player.truckSpeed * (c.t - prevT) + 400) return { ok: false, reason: 'can ' + c.id + ' too fast' };
        prev = spot; prevT = c.t;
      }
      return { ok: true, reason: 'seed path ok' };
    }

    function bankAtPad() {
      const L = det.led;
      const deposited = L.carried.length;
      const v = deposited ? verifyOilPath(L.carried) : { ok: true, reason: 'no oil' };
      const drb = deposited ? Math.max(1, Math.floor(deposited / 2)) : 0;
      if (deposited) {
        state.drb += drb;
        state.vaultPool += deposited * 5;
        if (v.ok) L.bankedDrb += drb;
        L.carried.forEach(c => { if (c.id >= 0) det.deposited[c.id] = 1; });
      }
      const gear = L.pendingGear + L.pendingByte;
      L.bankedGear += gear;
      L.deposits.push({ t: det.tick, cans: L.carried.map(c => c.id), oilOk: v.ok, reason: v.reason, gear, byte: L.pendingByte });
      L.pendingGear = 0; L.pendingByte = 0;
      L.carried = []; state.cans = 0;
      det.lastDepT = det.tick;
      state.oilTankCooldown = 2.0;
      depositPad.activeTimer = 1.2;
      if (oilCans.length === 0) { det.canWave++; spawnCans(); }
      playDumpSfx();
      updateHUD();
      const oilMsg = deposited ? `${deposited} cans ${v.ok ? '✅ seed-verified' : '⚠️ UNVERIFIED (' + v.reason + ')'} +${drb} DRB` : '';
      showToast(`🛢️ BANKED! ${oilMsg}${oilMsg && gear ? ' · ' : ''}${gear ? '+' + gear + ' GEAR banked (claim later)' : ''}`);
      if (!det.replaying) for (let p = 0; p < 25; p++) {
        particles.push({
          x: depositPad.x + depositPad.w / 2, y: depositPad.y + depositPad.h / 2,
          vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 100 - 30, alpha: 1, color: '#f59e0b'
        });
      }
    }

    function startRampJump(ramp) {
      if (!state.inTruck || player.jump || state.rampCooldown > 0) return;
      const face = ramp.face || 'north';
      // Never land inside a wall/wreck: walk the landing point back toward the ramp
      let lx = ramp.landX, ly = ramp.landY;
      const hw = player.w * 0.48, hh = player.h * 0.48;
      for (let k = 0; k < 80 && collidesAt(lx, ly, hw, hh, true); k++) {
        const ddx = (ramp.cx != null ? ramp.cx : player.x) - lx, ddy = (ramp.cy != null ? ramp.cy : player.y) - ly;
        const dd = Math.hypot(ddx, ddy); if (dd < 8) break;
        lx += ddx / dd * 8; ly += ddy / dd * 8;
      }
      player.jump = {
        t: 0, dur: 0.55,
        x0: player.x, y0: player.y,
        x1: lx, y1: ly,
        face
      };
      state.rampCooldown = 1.2;
      playTone(280, 'sawtooth', 0.08);
      setTimeout(() => playTone(520, 'triangle', 0.12), 80);
      showToast(ramp.landToast || '🛻 Fence jump!');
      for (let p = 0; p < 14; p++) {
        particles.push({
          x: player.x, y: player.y,
          vx: (Math.random() - 0.5) * 160,
          vy: -Math.random() * 140 - 40,
          alpha: 1, color: '#94a3b8'
        });
      }
    }

    function doClaimGearVault() {
      if (state.gearVaultCooldown > 0) {
        showToast(`⏳ Gear Vault Cooldown active! (${state.gearVaultCooldown.toFixed(1)}s remaining)`);
        playTone(200, 'sawtooth', 0.15);
        return;
      }

      state.gear += 1;
      state.gearVaultCooldown = 3.0; // 3-second global cooldown!
      updateHUD();
      playTone(580, 'square', 0.15);
      showToast("⚙️ +1 GEAR Tool claimed from Gear Vault! 3s global cooldown triggered.");
    }

    function doToggleTruck() {
      state.inTruck = !state.inTruck;
      if (state.inTruck) {
        playEngineSfx();
        showToast("🚗 Driving the Red Truck down the dirt road!");
      } else {
        showToast("🚶 On foot in the garage yard.");
      }
    }

    function doGiveCans(n) {
      // Rig cans have no seeded id (-1): they deposit UNVERIFIED (0 DRB).
      while (det.led.carried.length < state.maxCans && n-- > 0) det.led.carried.push({ id: -1, t: det.tick, x: player.x, y: player.y });
      state.cans = det.led.carried.length;
      updateHUD();
      playCanSfx();
      showToast(`🥫 Packed ${state.cans}/10 Cans! Drive onto the Oil Tank pad at the end of the yard.`);
    }

    function doWarpToPad() {
      player.x = depositPad.x + depositPad.w / 2;
      player.y = depositPad.y + depositPad.h / 2;
      showToast("📍 Arrived at the Oil Tank Deposit Pad!");
    }

    function doWarpToBlueSUV() {
      player.x = blueBay.x + blueBay.w / 2;
      player.y = rows[0].roadY + dirtRoadH / 2; // directly on the dirt road in front of bay 42
      showToast("📍 Arrived on the dirt road outside Blue SUV Bay #42!");
    }

    function doResetPlayerPosition() {
      player.x = yardStartX - 100;
      player.y = rows[4].roadY + dirtRoadH / 2;
      showToast("📍 Reset to west gate on bottom dirt road.");
    }

    // --- Main Update Loop ---
    let lastTime = performance.now();

    function update(dt) {
      // 3-second global cooldown countdown
      if (state.gearVaultCooldown > 0) {
        state.gearVaultCooldown -= dt;
        if (state.gearVaultCooldown < 0) state.gearVaultCooldown = 0;
        updateHUD();
      }

      if (state.oilTankCooldown > 0) {
        state.oilTankCooldown -= dt;
        if (state.oilTankCooldown < 0) state.oilTankCooldown = 0;
      }

      if (depositPad.activeTimer > 0) {
        depositPad.activeTimer -= dt;
      }

      if (state.rampCooldown > 0) {
        state.rampCooldown -= dt;
        if (state.rampCooldown < 0) state.rampCooldown = 0;
      }

      // Movement — keyboard + touch-on-sprite; fence-jump arc ignores collision
      if (player.jump) {
        const j = player.jump;
        j.t += dt;
        const u = Math.min(1, j.t / j.dur);
        const ease = u * u * (3 - 2 * u);
        player.x = j.x0 + (j.x1 - j.x0) * ease;
        player.y = j.y0 + (j.y1 - j.y0) * ease - Math.sin(Math.PI * u) * 70;
        player.heading = j.face === 'east' ? 0
          : j.face === 'south' ? Math.PI / 2
          : j.face === 'west' ? Math.PI
          : -Math.PI / 2;
        if (u >= 1) {
          player.x = j.x1;
          player.y = j.y1;
          player.jump = null;
        }
      } else {
        let dx = 0;
        let dy = 0;
        let usingTouch = false;

        if (simIn[4]) {
          usingTouch = true;
          const dragX = simIn[5];
          const dragY = simIn[6];
          const mag = Math.hypot(dragX, dragY);
          if (mag >= 14) {
            const nx = dragX / mag;
            const ny = dragY / mag;
            const fwdX = Math.cos(player.heading);
            const fwdY = Math.sin(player.heading);
            const along = nx * fwdX + ny * fwdY;
            const side = nx * (-fwdY) + ny * fwdX;
            const turnRate = state.inTruck ? 3.4 : 4.2;
            player.heading += side * turnRate * dt;
            const base = state.inTruck ? player.truckSpeed : player.speed;
            let thrust = 0;
            if (along > 0.12) thrust = base * Math.min(1, along);
            else if (along < -0.12) thrust = base * 0.25 * Math.max(-1, along); // reverse 1/4
            dx = Math.cos(player.heading) * thrust;
            dy = Math.sin(player.heading) * thrust;
          }
        }

        if (!usingTouch) {
          if (simIn[0]) dy -= 1;
          if (simIn[1]) dy += 1;
          if (simIn[2]) dx -= 1;
          if (simIn[3]) dx += 1;
          if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            const spd = state.inTruck ? player.truckSpeed : player.speed;
            dx = (dx / len) * spd;
            dy = (dy / len) * spd;
            player.heading = Math.atan2(dy, dx);
          }
        }

        if (dx !== 0 || dy !== 0) {
          const nextX = player.x + dx;
          const nextY = player.y + dy;
          const halfW = state.inTruck ? player.w * 0.48 : 5;
          const halfH = state.inTruck ? player.h * 0.48 : 5;
          const blocked = collidesAt(nextX, nextY, halfW, halfH, state.inTruck, player.x, player.y);

          if (!blocked) {
            player.x = Math.max(40, Math.min(world.width - 40, nextX));
            player.y = Math.max(30, Math.min(world.height - 40, nextY));
          }

          if (state.inTruck && Math.random() < 0.3) {
            player.trail.push({
              x: player.x - Math.cos(player.heading) * 20 + (Math.random() * 8 - 4),
              y: player.y - Math.sin(player.heading) * 20 + (Math.random() * 8 - 4),
              alpha: 0.6,
              size: Math.random() * 6 + 4
            });
            if (player.trail.length > 40) player.trail.shift();
          }
        }

        // Ramp triggers — truck only; walk can stand without launch
        if (state.inTruck && state.rampCooldown <= 0) {
          for (let ri = 0; ri < ramps.length; ri++) {
            const ramp = ramps[ri];
            if (player.x > ramp.x && player.x < ramp.x + ramp.w &&
                player.y > ramp.y && player.y < ramp.y + ramp.h) {
              startRampJump(ramp);
              break;
            }
          }
        }
      }

      player.trail.forEach(t => { t.alpha -= dt * 0.7; });
      player.trail = player.trail.filter(t => t.alpha > 0);

      // Collect oil cans
      const pickupRange = state.inTruck ? 38 : 24;
      for (let i = oilCans.length - 1; i >= 0; i--) {
        const can = oilCans[i];
        if (Math.hypot(player.x - can.x, player.y - can.y) < pickupRange) {
          if (state.cans < state.maxCans) {
            oilCans.splice(i, 1);
            det.led.carried.push({ id: can.id, t: det.tick, x: player.x, y: player.y });
            state.cans = det.led.carried.length;
            playCanSfx();
            updateHUD();
            showToast(`🥫 Collected Can! (${state.cans}/${state.maxCans})`);
          }
        }
      }

      // Placed gear pickups (level layout) → +1 GEAR pending
      for (let gi = 0; gi < gearPicks.length; gi++) {
        const gp = gearPicks[gi];
        if (!gp.taken && Math.hypot(player.x - gp.x, player.y - gp.y) < pickupRange) {
          gp.taken = true; det.led.pendingGear += 1;
          playTone(900, 'square', 0.07);
          showToast('⚙️ Found a gear! +1 GEAR pending.'); updateHUD();
        }
      }

      // TRUCK DEPOSIT PAD AUTOMATIC DEPOSIT
      const onPad = (player.x >= depositPad.x && player.x <= depositPad.x + depositPad.w &&
                     player.y >= depositPad.y && player.y <= depositPad.y + depositPad.h);

      if (onPad && state.inTruck) {
        const L = det.led;
        if ((state.cans > 0 || L.pendingGear + L.pendingByte > 0) && state.oilTankCooldown <= 0) {
          bankAtPad();
        }
      }

      particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= dt * 1.2;
      });
      particles = particles.filter(p => p.alpha > 0);

      // BYTE: seeded timer → runs a gear to the player → stash
      // BYTE only works while the player is inside the yard / garage area (not the streets)
      const inYard = player.x >= gate.x && player.x <= rightSealRight &&
        player.y >= northFence.y + northFence.h && player.y <= bottomWall.y + bottomWall.h;
      if (!byte.carrying && inYard && det.tick >= byte.nextT && det.led.stash < STASH_CAP) byte.carrying = true;
      if (byte.carrying && inYard) {
        const bdx = player.x - byte.x, bdy = player.y - byte.y;
        const bd = Math.hypot(bdx, bdy);
        if (bd < 22) {
          byte.carrying = false;
          det.led.stash += 1;
          det.led.handoffs.push({ n: byte.count, t: det.tick });
          byte.count++;
          byte.nextT = det.tick + byteInterval(byte.count);
          playTone(990, 'square', 0.06); setTimeout(() => playTone(1320, 'square', 0.06), 70);
          showToast(`🐕 BYTE brought a gear! Stash ${det.led.stash}/${STASH_CAP} — install it in a dark lamp pole.`);
          updateHUD();
        } else {
          const sp = 2.6;
          byte.x += bdx / bd * Math.min(sp, bd); byte.y += bdy / bd * Math.min(sp, bd);
          byte.face = bdx >= 0 ? 1 : -1;
        }
      }

      // Nearest dark pole (on foot)
      let nearPole = null, nearPoleD = 30;
      for (let pi = 0; pi < poles.length; pi++) {
        const p = poles[pi];
        if (p.on) continue;
        const d = Math.hypot(player.x - p.x, player.y - (p.y + 14));
        if (d < nearPoleD) { nearPoleD = d; nearPole = p; }
      }
      state.currentPole = nearPole;

      // Proximity
      const distToBlue = Math.hypot(player.x - blueSUV.x, player.y - blueSUV.y);
      let nearestGreen = null;
      let nearestGreenDist = Infinity;
      for (let gi = 0; gi < greenSUVs.length; gi++) {
        const s = greenSUVs[gi];
        const d = Math.hypot(player.x - s.x, player.y - s.y);
        if (d < nearestGreenDist) {
          nearestGreenDist = d;
          nearestGreen = s;
        }
      }
      const promptEl = det.replaying ? { style: {} } : document.getElementById('action-prompt');
      const actionTextEl = det.replaying ? {} : document.getElementById('action-text');

      const nearDoor = findNearestDoor(42);
      state.currentDoor = nearDoor;

      if (distToBlue < 65) {
        state.currentAction = 'inspect_blue_suv';
        promptEl.style.display = 'flex';
        actionTextEl.innerText = 'Inspect Blue SUV in Bay #42 (E)';
      } else if (nearestGreen && nearestGreenDist < 58) {
        state.currentAction = 'inspect_green_suv';
        promptEl.style.display = 'flex';
        actionTextEl.innerText = 'Inspect broken teal SUV (E)';
      } else if (nearPole && !state.inTruck) {
        state.currentAction = 'repair_pole';
        promptEl.style.display = 'flex';
        actionTextEl.innerText = det.led.stash > 0 ? `Install BYTE gear in Lamp #${nearPole.id} (E)` : `Lamp #${nearPole.id} dark — need a BYTE gear`;
      } else if (nearDoor && !state.inTruck) {
        state.currentAction = 'gear_door';
        promptEl.style.display = 'flex';
        const verb = nearDoor.doorOpen ? 'Close' : 'Open';
        actionTextEl.innerText = `${verb} Bay #${nearDoor.id} door (E · 1 GEAR)`;
      } else if (nearDoor && state.inTruck) {
        state.currentAction = null;
        promptEl.style.display = 'flex';
        actionTextEl.innerText = `Bay #${nearDoor.id} door — hop out + GEAR to toggle`;
      } else if (onPad && state.cans === 0) {
        state.currentAction = null;
        promptEl.style.display = 'flex';
        actionTextEl.innerText = 'Oil Tank Pad Active — Ready for Cans';
      } else {
        state.currentAction = null;
        promptEl.style.display = 'none';
      }

      if (!det.replaying) document.getElementById('radar-coords').innerText = `x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`;
    }

    // --- Render Loop ---
    function render() {
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      const camX = dev.on ? dev.cam.x : player.x, camY = dev.on ? dev.cam.y : player.y;
      const zoom = dev.on ? dev.cam.z : 1;
      ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-camX, -camY);

      const yardH = garageRows * (garageH + dirtRoadH);
      const viewLeft = camX - width / (2 * zoom) - 120;
      const viewRight = camX + width / (2 * zoom) + 120;

      // Terrain Base
      ctx.fillStyle = '#12151a';
      ctx.fillRect(0, 0, world.width, world.height);

      // === TOP STREET (north of north yard fence) ===
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(topStreet.x, topStreet.y, topStreet.w, topStreet.h);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(40, topStreet.y + topStreet.h / 2);
      ctx.lineTo(world.width - 40, topStreet.y + topStreet.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(topStreet.x, topStreet.y, topStreet.w, 6);
      ctx.fillRect(topStreet.x, topStreet.y + topStreet.h - 6, topStreet.w, 6);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('TOP STREET', yardStartX + 40, topStreet.y + topStreet.h / 2 + 8);

      // North yard fence (visual + already in solidBarriers)
      ctx.fillStyle = '#5b4636';
      ctx.fillRect(northFence.x, northFence.y, northFence.w, northFence.h);
      ctx.fillStyle = '#3f3228';
      ctx.fillRect(northFence.x + 1, northFence.y + 1, Math.max(0, northFence.w - 2), Math.max(0, northFence.h - 2));
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < northFence.w; i += 8) {
        ctx.beginPath();
        ctx.moveTo(northFence.x + i, northFence.y);
        ctx.lineTo(northFence.x + i + northFence.h, northFence.y + northFence.h);
        ctx.stroke();
      }
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(northFence.x, northFence.y, northFence.w, 3);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(northFence.x, northFence.y + northFence.h - 3, northFence.w, 3);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.75)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NORTH FENCE — RAMP JUMP ONLY', northFence.x + northFence.w * 0.35, northFence.y - 6);

      // === STREET zone (west of gate, outside yard) ===
      const streetTop = yardStartY - 50;
      const streetH = yardH + 100;
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(0, streetTop, gate.x, streetH);

      // Street lane dashed yellow center
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(40, streetTop + streetH / 2);
      ctx.lineTo(gate.x - 10, streetTop + streetH / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Street curbs
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, streetTop, gate.x, 8);
      ctx.fillRect(0, streetTop + streetH - 8, gate.x, 8);
      ctx.fillStyle = '#64748b';
      for (let cx = 20; cx < gate.x - 10; cx += 36) {
        ctx.fillRect(cx, streetTop + 1, 18, 6);
        ctx.fillRect(cx, streetTop + streetH - 7, 18, 6);
      }

      // STREET label
      ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STREET', gate.x / 2, streetTop + streetH / 2 - 18);

      // === PARKING LOT zone (inside yard after gate) — north + mid only ===
      // South of the bottom wall is STREET (drawn below), not lot.
      const lotBottom = bottomWall.y;
      ctx.fillStyle = '#323842';
      ctx.fillRect(gate.x, streetTop, yardEndX - gate.x + 90, lotBottom - streetTop);

      // Parking stall markings (NORTH apron only — south is street)
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 2;
      for (let px = yardStartX; px < yardEndX; px += 28) {
        ctx.beginPath();
        ctx.moveTo(px, streetTop + 14);
        ctx.lineTo(px, streetTop + 42);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.4)';
      ctx.beginPath();
      ctx.moveTo(yardStartX, streetTop + 42);
      ctx.lineTo(yardEndX, streetTop + 42);
      ctx.stroke();

      // PARKING LOT label near west apron inside
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('PARKING LOT', yardStartX + 40, streetTop + 34);

      // East service apron (still parking lot, clipped above bottom wall)
      ctx.fillStyle = '#2c323c';
      ctx.fillRect(yardEndX, streetTop, world.width - yardEndX, Math.max(0, lotBottom - streetTop));

      // === BOTTOM E-W STREET (south of garage wall) ===
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(bottomStreet.x, bottomStreet.y, bottomStreet.w, bottomStreet.h);
      // Yellow dashed center line
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(bottomStreet.x + 20, bottomStreet.y + bottomStreet.h / 2);
      ctx.lineTo(bottomStreet.x + bottomStreet.w - 20, bottomStreet.y + bottomStreet.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Curbs
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(bottomStreet.x, bottomStreet.y, bottomStreet.w, 8);
      ctx.fillRect(bottomStreet.x, bottomStreet.y + bottomStreet.h - 8, bottomStreet.w, 8);
      ctx.fillStyle = '#64748b';
      for (let cx = bottomStreet.x + 20; cx < bottomStreet.x + bottomStreet.w - 10; cx += 36) {
        ctx.fillRect(cx, bottomStreet.y + 1, 18, 6);
        ctx.fillRect(cx, bottomStreet.y + bottomStreet.h - 7, 18, 6);
      }
      ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('STREET', yardStartX + 40, bottomStreet.y + bottomStreet.h / 2 + 8);

      // === Bottom garage wall (visual barrier full garage length) ===
      renderBottomGarageWall();

      // Dirt service roads between garage rows (inside parking lot)
      for (let r = 0; r < garageRows; r++) {
        const road = rows[r];

        ctx.fillStyle = '#3a2e22';
        ctx.fillRect(yardStartX - 10, road.roadY, (yardEndX - yardStartX) + 80, road.roadH);

        // Soft road shadow edge
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(yardStartX - 10, road.roadY + road.roadH - 4, (yardEndX - yardStartX) + 80, 4);

        // Tire ruts
        ctx.strokeStyle = '#2b2118';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(yardStartX - 10, road.roadY + 18);
        ctx.lineTo(yardEndX + 70, road.roadY + 18);
        ctx.moveTo(yardStartX - 10, road.roadY + road.roadH - 18);
        ctx.lineTo(yardEndX + 70, road.roadY + road.roadH - 18);
        ctx.stroke();

        ctx.fillStyle = '#4b3c2c';
        ctx.fillRect(yardStartX - 10, road.roadY, (yardEndX - yardStartX) + 80, 3);
        ctx.fillRect(yardStartX - 10, road.roadY + road.roadH - 3, (yardEndX - yardStartX) + 80, 3);
      }

      // N/S connecting avenues inside lot
      ctx.fillStyle = '#3a2e22';
      ctx.fillRect(yardStartX - 14, yardStartY, 28, yardH);
      ctx.fillRect(yardEndX - 8, yardStartY, 70, yardH);

      // Gate (extruded 2.5D)
      renderGate();

      // Dust trails
      player.trail.forEach(t => {
        ctx.fillStyle = `rgba(140, 110, 80, ${t.alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 500 Garages — soft isometric extrusion
      garages.forEach(g => {
        if (g.x + g.w < viewLeft || g.x > viewRight) return;
        renderGarage3D(g);
      });

      // Light poles (every 10 bays)
      poles.forEach(p => { if (p.x > viewLeft && p.x < viewRight) renderPole(p); });
      // Broken-gear trap piles + oil spills
      debris.forEach(renderDebris);
      spills.forEach(sp => {
        ctx.fillStyle = 'rgba(20,14,6,0.75)';
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      });
      // Broken-down vehicle maze
      // stacked: draw lower z first
      const stackables = wrecks.map(w => ['w', w]).concat(crates.map(c => ['c', c])).sort((a, b) => (a[1].z - b[1].z) || (a[1].y - b[1].y));
      stackables.forEach(([k, o]) => { if (o.x + o.w > viewLeft && o.x < viewRight) (k === 'w' ? renderWreck : renderCrate)(o); });
      gearPicks.forEach(g => { if (!g.taken) renderGearPick(g); });

      // Blue SUV inside Bay #42
      renderBlueSUV(blueSUV.x, blueSUV.y);

      // Green / teal road blockers
      greenSUVs.forEach(s => {
        if (s.x + s.length < viewLeft || s.x - s.length > viewRight) return;
        renderGreenSUV(s);
      });

      // Oil tank yard fence (behind pad/tank sprites)
      renderOilYardFence();

      // Right-side dead-zone fence (seals lot/yard; south street stays clear)
      renderRightDeadFence();

      // Oil Tank & Deposit Pad
      renderOilTankAndPad();

      // Oil Cans (extruded)
      oilCans.forEach(can => {
        if (can.x < viewLeft || can.x > viewRight) return;
        renderOilCan3D(can);
      });

      // Particles
      particles.forEach(p => {
        ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Fence-jump ramps
      for (let ri = 0; ri < ramps.length; ri++) renderRamp(ramps[ri]);

      renderByte();
      if (dev.on) renderDevOverlay();

      // Player
      if (state.inTruck) {
        renderRedTruck(player.x, player.y, player.heading);
      } else {
        renderDriver(player.x, player.y, player.heading);
      }

      ctx.restore();
      renderRadar();
    }

    function renderGate() {
      const gx = gate.x;
      const pw = gate.postW;
      const depth = 10;
      const midY = westGateCy;

      // West front walls (solid) — north & south of gate opening only
      for (let i = 0; i < westFrontWallSegs.length; i++) {
        const s = westFrontWallSegs[i];
        // Soft shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(s.x + 2, s.y + s.h - 2, s.w + 4, 6);
        // Extrusion face
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(s.x + s.w, s.y);
        ctx.lineTo(s.x + s.w + depth, s.y - 6);
        ctx.lineTo(s.x + s.w + depth, s.y + s.h - 6);
        ctx.lineTo(s.x + s.w, s.y + s.h);
        ctx.fill();
        // Front face
        ctx.fillStyle = '#334155';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#475569';
        ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, Math.max(0, s.h - 4));
        // Hazard tick marks along wall
        for (let hy = s.y + 8; hy < s.y + s.h - 8; hy += 22) {
          ctx.fillStyle = '#eab308';
          ctx.fillRect(s.x + 2, hy, s.w - 4, 8);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(s.x + 2, hy + 8, s.w - 4, 8);
        }
      }

      // Gate posts at opening edges
      ctx.fillStyle = '#475569';
      ctx.fillRect(gx, westGateTop - 6, pw, 12);
      ctx.fillRect(gx, westGateBot - 6, pw, 12);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(gx + 2, westGateTop - 4, pw - 4, 8);
      ctx.fillRect(gx + 2, westGateBot - 4, pw - 4, 8);

      // Crossbar / arch over opening band near road 1
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(gx - 4, westGateTop - 14, 28, 10);
      // Top face
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(gx - 4, westGateTop - 14);
      ctx.lineTo(gx + 2, westGateTop - 22);
      ctx.lineTo(gx + 30, westGateTop - 22);
      ctx.lineTo(gx + 24, westGateTop - 14);
      ctx.fill();

      // Barrier stripes in the open gate band (visual only — no collision)
      ctx.fillStyle = '#f59e0b';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(gx + 2, midY - 48 + i * 22, 10, 10);
      }
      ctx.fillStyle = '#0f172a';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(gx + 2, midY - 38 + i * 22, 10, 10);
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GATE', gx + 10, westGateTop - 26);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('STREET ← | → LOT', gx + 10, westGateTop - 14);
    }

    function renderGarage3D(g) {
      const d = 8; // extrusion depth

      // Ground soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(g.x + g.w / 2 + 4, g.y + g.h + 4, g.w / 2 + 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Right height face
      ctx.fillStyle = '#0b1018';
      ctx.beginPath();
      ctx.moveTo(g.x + g.w, g.y);
      ctx.lineTo(g.x + g.w + d, g.y - d * 0.7);
      ctx.lineTo(g.x + g.w + d, g.y + g.h - d * 0.7);
      ctx.lineTo(g.x + g.w, g.y + g.h);
      ctx.closePath();
      ctx.fill();

      // Top height face
      ctx.fillStyle = '#2a3548';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x + d, g.y - d * 0.7);
      ctx.lineTo(g.x + g.w + d, g.y - d * 0.7);
      ctx.lineTo(g.x + g.w, g.y);
      ctx.closePath();
      ctx.fill();

      // Front face
      ctx.fillStyle = '#1c2430';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = '#3b4a5f';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(g.x, g.y, g.w, g.h);

      if (g.doorOpen) {
        ctx.fillStyle = '#0a1018';
        ctx.fillRect(g.x + 3, g.y + 12, g.w - 6, g.h - 12);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(g.x + 2, g.y + 11, g.w - 4, g.h - 11);
      } else {
        ctx.fillStyle = '#273549';
        ctx.fillRect(g.x + 4, g.y + 14, g.w - 8, g.h - 14);
        ctx.strokeStyle = '#1a2330';
        ctx.lineWidth = 1;
        for (let s = g.y + 18; s < g.y + g.h; s += 6) {
          ctx.beginPath();
          ctx.moveTo(g.x + 4, s);
          ctx.lineTo(g.x + g.w - 4, s);
          ctx.stroke();
        }
        // Door lip highlight
        ctx.fillStyle = 'rgba(148,163,184,0.25)';
        ctx.fillRect(g.x + 4, g.y + 14, g.w - 8, 3);
      }

      if (g.revealed && g.content) {
        const c = g.content;
        ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        if (c.kind === 'prize') { ctx.fillStyle = '#fbbf24'; ctx.fillText('+' + c.amt + '⚙', g.x + g.w / 2, g.y + 40); }
        else if (c.kind === 'trap') { ctx.fillStyle = '#f87171'; ctx.fillText(c.trap === 'spill' ? '☠OIL' : c.trap === 'drop' ? '☠GEAR' : '☠PILE', g.x + g.w / 2, g.y + 40); }
        else { ctx.fillStyle = '#475569'; ctx.fillText('empty', g.x + g.w / 2, g.y + 40); }
      }
      // Number plate with slight lift
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(g.x + 3, g.y + 2, 28, 11);
      ctx.fillStyle = g.doorOpen ? '#38bdf8' : '#94a3b8';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('#' + g.id, g.x + 5, g.y + 10);
    }

    function renderPole(p) {
      const by = p.y + 14;
      if (p.on) {
        const gr = ctx.createRadialGradient(p.x, by + 18, 2, p.x, by + 18, 46);
        gr.addColorStop(0, 'rgba(253, 224, 71, 0.38)');
        gr.addColorStop(1, 'rgba(253, 224, 71, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p.x, by + 18, 46, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#334155'; ctx.fillRect(p.x - 1.5, p.y - 30, 3, 44);   // post (in wall gap)
      ctx.fillStyle = p.on ? '#fde047' : '#1f2937';
      ctx.beginPath(); ctx.arc(p.x, p.y - 30, 5, 0, Math.PI * 2); ctx.fill(); // lamp head
      ctx.strokeStyle = p.on ? '#facc15' : '#ef4444'; ctx.lineWidth = 1; ctx.stroke();
      // tiny generator box at base
      ctx.fillStyle = p.on ? '#166534' : '#7f1d1d';
      ctx.fillRect(p.x - 7, by - 6, 14, 10);
      ctx.fillStyle = p.on ? '#4ade80' : '#fca5a5';
      ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(p.on ? '⚙' : '!', p.x, by + 2);
      ctx.fillStyle = p.on ? 'rgba(253,224,71,0.8)' : 'rgba(248,113,113,0.85)';
      ctx.fillText('L' + p.id, p.x, by + 12);
    }
    function renderDebris(d) {
      ctx.fillStyle = 'rgba(30,30,30,0.6)';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      for (let i = 0; i < 14; i++) {
        const gx = d.x + ((i * 37 + d.door * 13) % d.w), gy = d.y + ((i * 53 + d.door * 7) % d.h);
        ctx.strokeStyle = i % 2 ? '#78716c' : '#a8a29e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(gx, gy, 4 + (i % 3), 0, Math.PI * 1.6); ctx.stroke();
      }
      ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('BROKEN GEARS', d.x + d.w / 2, d.y + d.h / 2);
    }
    function renderCrate(c) {
      const lift = c.z * 9, x = c.x, y = c.y - lift;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
      ctx.fillStyle = '#92400e'; ctx.fillRect(x, y, c.w, c.h);
      ctx.fillStyle = '#b45309'; ctx.fillRect(x + 2, y + 2, c.w - 4, c.h - 4);
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, c.w - 4, c.h - 4);
      ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + c.w - 3, y + c.h - 3); ctx.moveTo(x + c.w - 3, y + 3); ctx.lineTo(x + 3, y + c.h - 3); ctx.stroke();
    }
    function renderGearPick(g) {
      const t = (det.tick % 120) / 120 * Math.PI * 2;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(t);
      ctx.fillStyle = '#38bdf8';
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -10, 4, 5); }
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function renderWreck(w0) {
      const w = w0.z ? { x: w0.x, y: w0.y - w0.z * 12, w: w0.w, h: w0.h, col: w0.col } : w0;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(w.x + 3, w.y + 4, w.w, w.h);
      ctx.fillStyle = w.col;
      ctx.beginPath(); ctx.roundRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w.x + 6, w.y + 6, w.w - 12, w.h - 12);
      ctx.fillStyle = '#0f172a';
      if (w.w >= w.h) { ctx.fillRect(w.x + 6, w.y - 2, 10, 4); ctx.fillRect(w.x + w.w - 16, w.y + w.h - 2, 10, 4); }
      else { ctx.fillRect(w.x - 2, w.y + 6, 4, 10); ctx.fillRect(w.x + w.w - 2, w.y + w.h - 16, 4, 10); }
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(w.x + 8, w.y + 8); ctx.lineTo(w.x + w.w - 8, w.y + w.h - 8); ctx.stroke();
    }
    function renderByte() {
      const x = byte.x, y = byte.y;
      ctx.save(); ctx.translate(x, y); ctx.scale(byte.face, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 7, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a16207'; ctx.fillRect(-10, -4, 18, 9);           // body
      ctx.fillRect(6, -9, 8, 8);                                          // head
      ctx.fillStyle = '#713f12'; ctx.fillRect(8, -11, 3, 4);              // ear
      ctx.fillRect(-9, 4, 3, 4); ctx.fillRect(4, 4, 3, 4);                // legs
      ctx.fillRect(-13, -6, 4, 3);                                        // tail
      ctx.fillStyle = '#000'; ctx.fillRect(12, -7, 2, 2);
      ctx.restore();
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#10b981'; ctx.fillText('BYTE', x, y - 14);
      if (byte.carrying) {
        ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(x + byte.face * 14, y - 3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(x + byte.face * 14, y - 3, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    function renderOilCan3D(can) {
      const bob = Math.sin(performance.now() * 0.005 + can.bobble) * 2;
      const x = can.x;
      const y = can.y + bob;

      // Soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + 2, can.y + 10, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Side extrusion face
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x - 4, y - 6, 12, 14);

      // Front
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x - 6, y - 8, 12, 16);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x, y - 8, 6, 0, Math.PI, true);
      ctx.fill();
      // Top rim face
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x - 2, y - 12, 4, 4);
    }

    function renderBlueSUV(cx, cy) {
      ctx.save();
      ctx.translate(cx, cy);

      // Soft drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.ellipse(3, blueSUV.length / 2 - 4, blueSUV.w / 2 + 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Height / side face (extrusion)
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.roundRect(-blueSUV.w / 2 + 4, -blueSUV.length / 2 + 4, blueSUV.w, blueSUV.length, 6);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-blueSUV.w / 2 - 3, -blueSUV.length / 2 + 6, 4, 12);
      ctx.fillRect(blueSUV.w / 2 - 1, -blueSUV.length / 2 + 6, 4, 12);
      ctx.fillRect(-blueSUV.w / 2 - 3, blueSUV.length / 2 - 16, 4, 12);
      ctx.fillRect(blueSUV.w / 2 - 1, blueSUV.length / 2 - 16, 4, 12);

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.roundRect(-blueSUV.w / 2, -blueSUV.length / 2, blueSUV.w, blueSUV.length, 6);
      ctx.fill();

      // Roof inset (darker = height)
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(-blueSUV.w / 2 + 4, -blueSUV.length / 2 + 10, blueSUV.w - 8, blueSUV.length - 20);
      ctx.fillStyle = '#172554';
      ctx.fillRect(-blueSUV.w / 2 + 6, -blueSUV.length / 2 + 14, blueSUV.w - 12, blueSUV.length - 30);

      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(-blueSUV.w / 2 + 6, blueSUV.length / 2 - 18, blueSUV.w - 12, 6);
      ctx.fillRect(-blueSUV.w / 2 + 6, -blueSUV.length / 2 + 12, blueSUV.w - 12, 5);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-blueSUV.w / 2 + 3, blueSUV.length / 2 - 2, 6, 3);
      ctx.fillRect(blueSUV.w / 2 - 9, blueSUV.length / 2 - 2, 6, 3);

      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-5, blueSUV.length / 2 - 2, 10, 3);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BLUE SUV (BAY #42)', 0, -blueSUV.length / 2 - 8);

      ctx.restore();
    }

    function renderGreenSUV(s) {
      ctx.save();
      ctx.translate(s.x, s.y);

      // Soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(4, 6, s.length / 2 + 4, s.w / 2 + 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Extruded side face (teal-dark)
      ctx.fillStyle = '#115e59';
      ctx.beginPath();
      ctx.roundRect(-s.length / 2 + 5, -s.w / 2 + 4, s.length, s.w, 5);
      ctx.fill();

      // Wheels
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-s.length / 2 + 6, -s.w / 2 - 3, 12, 4);
      ctx.fillRect(s.length / 2 - 18, -s.w / 2 - 3, 12, 4);
      ctx.fillRect(-s.length / 2 + 6, s.w / 2 - 1, 12, 4);
      ctx.fillRect(s.length / 2 - 18, s.w / 2 - 1, 12, 4);

      // Body — blue-green / teal-green
      ctx.fillStyle = '#0d9488';
      ctx.beginPath();
      ctx.roundRect(-s.length / 2, -s.w / 2, s.length, s.w, 5);
      ctx.fill();

      // Roof height
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(-s.length / 2 + 6, -s.w / 2 + 5, s.length - 12, s.w - 10);
      ctx.fillStyle = '#134e4a';
      ctx.fillRect(-s.length / 2 + 10, -s.w / 2 + 8, s.length - 20, s.w - 16);

      // Windows
      ctx.fillStyle = '#99f6e4';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-s.length / 2 + 10, -s.w / 2 + 7, 10, s.w - 14);
      ctx.fillRect(s.length / 2 - 20, -s.w / 2 + 7, 10, s.w - 14);
      ctx.globalAlpha = 1;

      // Hazard / broke vibe
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-4, -s.w / 2 - 2, 8, 3);

      ctx.fillStyle = '#5eead4';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BROKE DOWN', 0, -s.w / 2 - 6);

      ctx.restore();
    }

    function renderBottomGarageWall() {
      const w = bottomWall;
      // Soft ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(w.x - 2, w.y + w.h - 2, w.w + 4, 8);

      // Concrete / barrier body
      ctx.fillStyle = '#3f4a5a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      // Top face (extrusion read)
      ctx.fillStyle = '#64748b';
      ctx.fillRect(w.x, w.y, w.w, 4);
      // Dark base lip
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3);

      // Hazard stripes along the wall
      for (let sx = w.x + 8; sx < w.x + w.w - 8; sx += 28) {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(sx, w.y + 4, 12, w.h - 7);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx + 12, w.y + 4, 12, w.h - 7);
      }

      // Occasional posts
      ctx.fillStyle = '#94a3b8';
      for (let px = w.x; px <= w.x + w.w; px += 54) {
        ctx.fillRect(px - 2, w.y - 6, 4, w.h + 10);
      }
    }

    function renderRightDeadFence() {
      function drawFenceRun(x, y, w, h) {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#3f3228';
        ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 1;
        const step = 8;
        for (let i = -h; i < w + h; i += step) {
          ctx.beginPath();
          ctx.moveTo(x + i, y);
          ctx.lineTo(x + i + h, y + h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + i, y + h);
          ctx.lineTo(x + i + h, y);
          ctx.stroke();
        }
        ctx.fillStyle = '#8b5a2b';
        if (h <= rightFenceT + 2) {
          ctx.fillRect(x, y, w, 3);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(x, y + h - 3, w, 3);
        } else {
          ctx.fillRect(x, y, 3, h);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(x + w - 3, y, 3, h);
        }
        ctx.restore();
        ctx.fillStyle = '#78716c';
        if (w >= h) {
          for (let px = x; px <= x + w; px += 28) {
            ctx.fillRect(px - 2, y - 4, 4, h + 8);
          }
        } else {
          for (let py = y; py <= y + h; py += 28) {
            ctx.fillRect(x - 4, py - 2, w + 8, 4);
          }
        }
      }

      for (let i = 0; i < rightFenceSegs.length; i++) {
        const s = rightFenceSegs[i];
        drawFenceRun(s.x, s.y, s.w, s.h);
      }

      ctx.fillStyle = 'rgba(234, 179, 8, 0.7)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const midX = (rightSealX + rightSealRight) / 2;
      ctx.fillText('RESTRICTED — NO ENTRY FROM LOT', midX, (yardStartY - 50) + 24);
    }

    function renderOilYardFence() {
      const o = oilYard;
      const t = o.wallT;
      const gateCy = depositPad.y + depositPad.h / 2;
      const gateTop = gateCy - o.gateGap / 2;
      const gateBot = gateCy + o.gateGap / 2;

      // Ground stain inside compound
      ctx.fillStyle = 'rgba(40, 28, 18, 0.55)';
      ctx.fillRect(o.x, o.y, o.w, o.h);

      // Soft drop shadow under fence line
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(o.x - 2, o.y + o.h - 2, o.w + 6, 8);

      function drawFenceRun(x, y, w, h) {
        // Rusty rail / post fill
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#3f3228';
        ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));

        // Chain-link diamond mesh
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 1;
        const step = 8;
        for (let i = -h; i < w + h; i += step) {
          ctx.beginPath();
          ctx.moveTo(x + i, y);
          ctx.lineTo(x + i + h, y + h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + i, y + h);
          ctx.lineTo(x + i + h, y);
          ctx.stroke();
        }
        // Top rusty pipe
        ctx.fillStyle = '#8b5a2b';
        if (h <= t + 2) {
          ctx.fillRect(x, y, w, 3);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(x, y + h - 3, w, 3);
        } else {
          ctx.fillRect(x, y, 3, h);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(x + w - 3, y, 3, h);
        }
        ctx.restore();

        // Fence posts
        ctx.fillStyle = '#78716c';
        if (w >= h) {
          for (let px = x; px <= x + w; px += 28) {
            ctx.fillRect(px - 2, y - 4, 4, h + 8);
          }
        } else {
          for (let py = y; py <= y + h; py += 28) {
            ctx.fillRect(x - 4, py - 2, w + 8, 4);
          }
        }
      }

      // West / north / south solid; east split around gate
      drawFenceRun(o.x, o.y, t, o.h);
      drawFenceRun(o.x, o.y, o.w, t);
      drawFenceRun(o.x, o.y + o.h - t, o.w, t);
      drawFenceRun(o.x + o.w - t, o.y, t, Math.max(0, gateTop - o.y));
      drawFenceRun(o.x + o.w - t, gateBot, t, Math.max(0, o.y + o.h - gateBot));

      // Gate posts + hazard stripe at east entrance
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(o.x + o.w - t - 2, gateTop - 6, t + 4, 6);
      ctx.fillRect(o.x + o.w - t - 2, gateBot, t + 4, 6);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(o.x + o.w - t, gateTop, 3, o.gateGap);
      ctx.fillStyle = '#111827';
      for (let gy = gateTop; gy < gateBot; gy += 10) {
        ctx.fillRect(o.x + o.w - t, gy, 3, 5);
      }

      ctx.fillStyle = 'rgba(234, 179, 8, 0.75)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OIL TANK YARD — FENCED', o.x + o.w / 2, o.y - 8);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '9px monospace';
      ctx.fillText('NO ENTRY FROM PARKING LOT  ·  EAST GATE ONLY', o.x + o.w / 2, o.y + o.h + 14);
    }

    function renderOilTankAndPad() {
      ctx.save();
      const pad = depositPad;

      ctx.fillStyle = pad.activeTimer > 0 ? '#3b2f1e' : '#1e293b';
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
      ctx.strokeStyle = pad.activeTimer > 0 ? '#10b981' : '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(pad.x, pad.y, pad.w, pad.h);

      ctx.fillStyle = '#eab308';
      for (let s = pad.x; s < pad.x + pad.w - 10; s += 16) {
        ctx.fillRect(s, pad.y, 8, 4);
        ctx.fillRect(s, pad.y + pad.h - 4, 8, 4);
      }

      ctx.strokeStyle = pad.activeTimer > 0 ? '#34d399' : 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad.x + pad.w / 2, pad.y + pad.h / 2, 28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TRUCK DEPOSIT PAD', pad.x + pad.w / 2, pad.y + pad.h / 2 - 6);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(state.oilTankCooldown > 0 ? `COOLING (${state.oilTankCooldown.toFixed(1)}s)` : 'DRIVE TRUCK HERE TO DUMP', pad.x + pad.w / 2, pad.y + pad.h / 2 + 10);

      const tank = oilTank;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.ellipse(tank.x, tank.y + 40, tank.radius + 10, tank.radius / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.fillRect(tank.x - tank.radius, tank.y - tank.height / 2, tank.radius * 2, tank.height);

      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(tank.x, tank.y - tank.height / 2, tank.radius, Math.PI, 0);
      ctx.fill();

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tank.x - tank.radius, tank.y);
      ctx.lineTo(tank.x + tank.radius, tank.y);
      ctx.moveTo(tank.x - tank.radius, tank.y + 35);
      ctx.lineTo(tank.x + tank.radius, tank.y + 35);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(tank.x - tank.radius + 10, tank.y - 20, (tank.radius - 10) * 2, 24);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('COMMUNITY OIL TANK', tank.x, tank.y - 6);
      ctx.font = '8px monospace';
      ctx.fillText('DRB DROP VAULT', tank.x, tank.y + 2);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(tank.x + tank.radius - 16, tank.y - 40, 8, 80);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(tank.x + tank.radius - 15, tank.y + 40 - 55, 6, 55);

      ctx.restore();
    }

    function renderRamp(ramp) {
      // Draw an east-facing wedge in local space, rotated to the ramp's facing.
      const L = ramp.rot === 90 || ramp.rot === 270 ? ramp.h : ramp.w;
      const W = ramp.rot === 90 || ramp.rot === 270 ? ramp.w : ramp.h;
      const cx = ramp.cx != null ? ramp.cx : ramp.x + ramp.w / 2, cy = ramp.cy != null ? ramp.cy : ramp.y + ramp.h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((ramp.rot || 0) * Math.PI / 180);
      const x = -L / 2, y = -W / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 3, y + 4, L, W);
      ctx.fillStyle = '#78716c';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + W); ctx.lineTo(x + L - 8, y + W - 6); ctx.lineTo(x + L - 8, y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath(); ctx.moveTo(x + L - 8, y + 6); ctx.lineTo(x + L - 8, y + W - 6); ctx.lineTo(x + L, y + W - 10); ctx.lineTo(x + L, y + 10); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#eab308'; ctx.fillRect(x + 8 + i * 12, y + 10 + i * 2, 5, W - 20 - i * 4);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(x + 14 + i * 12, y + 10 + i * 2, 5, W - 20 - i * 4);
      }
      ctx.restore();
      ctx.fillStyle = '#fef08a'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(ramp.label || 'RAMP', cx, ramp.y - 4);
    }

    function renderRedTruck(x, y, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Soft drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(4, 5, player.w / 2 + 4, player.h / 2 + 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Extruded underside / height face
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.roundRect(-player.w / 2 + 4, -player.h / 2 + 4, player.w, player.h, 6);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-player.w / 2 + 6, -player.h / 2 - 4, 14, 6);
      ctx.fillRect(player.w / 2 - 20, -player.h / 2 - 4, 14, 6);
      ctx.fillRect(-player.w / 2 + 6, player.h / 2 - 2, 14, 6);
      ctx.fillRect(player.w / 2 - 20, player.h / 2 - 2, 14, 6);

      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(-player.w / 2, -player.h / 2, player.w, player.h, 6);
      ctx.fill();

      ctx.fillStyle = '#991b1b';
      ctx.fillRect(0, -player.h / 2 + 3, player.w / 2 - 4, player.h - 6);
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(2, -player.h / 2 + 6, player.w / 2 - 8, player.h - 12);

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(player.w / 4, -player.h / 2 + 5, 6, player.h - 10);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-player.w / 2 + 4, -player.h / 2 + 4, player.w / 2 - 6, player.h - 8);

      if (state.cans > 0) {
        ctx.fillStyle = '#f59e0b';
        const cols = Math.min(state.cans, 5);
        for (let i = 0; i < cols; i++) {
          ctx.beginPath();
          ctx.arc(-player.w / 2 + 8 + i * 4, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(player.w / 2 - 2, -player.h / 2 + 4, 2, 6);
      ctx.fillRect(player.w / 2 - 2, player.h / 2 - 10, 2, 6);

      ctx.restore();
    }

    function renderDriver(x, y, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(2, 5, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body height face
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(2, 2, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(3, 0, 7, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      ctx.restore();
    }

    function renderRadar() {
      const rw = radarCanvas.width;
      const rh = radarCanvas.height;
      radarCtx.clearRect(0, 0, rw, rh);

      const scaleX = rw / world.width;
      const scaleY = rh / world.height;

      // Street
      radarCtx.fillStyle = '#334155';
      radarCtx.fillRect(0, (yardStartY - 40) * scaleY, gate.x * scaleX, (garageRows * (garageH + dirtRoadH) + 80) * scaleY);

      // Parking lot
      radarCtx.fillStyle = '#475569';
      radarCtx.fillRect(gate.x * scaleX, yardStartY * scaleY, (yardEndX - gate.x) * scaleX, (garageRows * (garageH + dirtRoadH)) * scaleY);

      radarCtx.fillStyle = '#785638';
      for (let r = 0; r < garageRows; r++) {
        radarCtx.fillRect(yardStartX * scaleX, rows[r].roadY * scaleY, (yardEndX - yardStartX) * scaleX, dirtRoadH * scaleY);
      }

      // Gate line
      radarCtx.strokeStyle = '#f59e0b';
      radarCtx.lineWidth = 1;
      radarCtx.beginPath();
      radarCtx.moveTo(gate.x * scaleX, yardStartY * scaleY);
      radarCtx.lineTo(gate.x * scaleX, (yardStartY + garageRows * (garageH + dirtRoadH)) * scaleY);
      radarCtx.stroke();

      radarCtx.fillStyle = '#14b8a6';
      greenSUVs.forEach(s => {
        radarCtx.fillRect(s.x * scaleX - 1.5, s.y * scaleY - 1, 3, 2);
      });

      radarCtx.fillStyle = '#38bdf8';
      radarCtx.beginPath();
      radarCtx.arc(blueSUV.x * scaleX, blueSUV.y * scaleY, 3, 0, Math.PI * 2);
      radarCtx.fill();

      radarCtx.fillStyle = '#f59e0b';
      radarCtx.strokeStyle = '#a8a29e';
      radarCtx.lineWidth = 1;
      radarCtx.strokeRect(oilYard.x * scaleX, oilYard.y * scaleY, oilYard.w * scaleX, oilYard.h * scaleY);
      radarCtx.fillRect(oilTank.x * scaleX - 3, oilTank.y * scaleY - 3, 7, 7);

      poles.forEach(p => { radarCtx.fillStyle = p.on ? '#fde047' : '#7f1d1d'; radarCtx.fillRect(p.x * scaleX - 1, p.y * scaleY - 1, 2, 2); });
      radarCtx.fillStyle = '#a8a29e';
      wrecks.forEach(w => radarCtx.fillRect(w.x * scaleX, w.y * scaleY, Math.max(1, w.w * scaleX), Math.max(1, w.h * scaleY)));
      radarCtx.fillStyle = '#10b981'; radarCtx.fillRect(byte.x * scaleX - 1.5, byte.y * scaleY - 1.5, 3, 3);
      radarCtx.fillStyle = '#ef4444';
      radarCtx.beginPath();
      radarCtx.arc(player.x * scaleX, player.y * scaleY, 4, 0, Math.PI * 2);
      radarCtx.fill();
    }

    function updateHUD() {
      if (det.replaying) return;
      document.getElementById('hud-cans').innerText = `${state.cans}/${state.maxCans}`;
      document.getElementById('hud-drb').innerText = state.drb;
      document.getElementById('hud-gear').innerText = state.gear;
      const L = det.led;
      const pe = document.getElementById('hud-pending');
      if (pe) pe.innerText = (L.pendingGear + L.pendingByte) + ' · bank ' + L.bankedGear;
      const se = document.getElementById('hud-stash');
      if (se) se.innerText = L.stash + '/' + STASH_CAP;

      const cdEl = document.getElementById('hud-vault-cd');
      if (state.gearVaultCooldown > 0) {
        cdEl.innerText = `${state.gearVaultCooldown.toFixed(1)}s`;
        document.getElementById('pill-vault').style.borderColor = '#ec4899';
      } else {
        cdEl.innerText = 'Ready (3s)';
        document.getElementById('pill-vault').style.borderColor = 'var(--border-subtle)';
      }
    }
    updateHUD();

    // ---------------- Fixed-tick DET driver ----------------
    function sampleInput() {
      const k = state.keys, td = state.touchDrive;
      let tm = 0, tx = 0, ty = 0;
      if (td.active && td.moved) { tm = 1; tx = Math.round(td.curSX - td.startSX); ty = Math.round(td.curSY - td.startSY); }
      return [k.up ? 1 : 0, k.down ? 1 : 0, k.left ? 1 : 0, k.right ? 1 : 0, tm, tx, ty];
    }
    function detTick() {
      const inp = sampleInput();
      const key = inp.join(',');
      if (key !== det.lastIn) { det.lastIn = key; det.log.push({ t: det.tick, k: 'in', v: inp }); }
      simIn = inp;
      const acts = det.pending; det.pending = [];
      for (const a of acts) { det.log.push(Object.assign({ t: det.tick }, a)); applyAct(a); }
      update(TICK);
      det.tick++;
    }
    function resetSim(seed, label) {
      det.seed = seed >>> 0; det.seedLabel = label != null ? String(label) : String(det.seed);
      det.tick = 0; det.log = []; det.pending = []; det.lastIn = '';
      det.canWave = 0; det.canLayout = {}; det.deposited = {}; det.lastDepT = 0;
      det.led = freshLedger();
      simIn = [0, 0, 0, 0, 0, 0, 0];
      Object.assign(state, { cans: 0, drb: 0, gear: 5, inTruck: true, gearVaultCooldown: 0, oilTankCooldown: 0,
        vaultPool: 450000, currentAction: null, currentDoor: null, currentPole: null, rampCooldown: 0 });
      player.x = yardStartX - 100; player.y = rows[4].roadY + dirtRoadH / 2;
      player.heading = 0; player.jump = null; player.trail = [];
      garages.forEach(g => { g.doorOpen = false; });
      if (!det.levels) applyLevels(null, null);
      gearPicks.forEach(g => { g.taken = false; });
      buildDoorTable(); seedPoles();
      debris.length = 0; spills = []; particles = [];
      byte.x = byteHome.x; byte.y = byteHome.y; byte.carrying = false; byte.count = 0; byte.face = 1;
      byte.nextT = byteInterval(0);
      depositPad.activeTimer = 0;
      spawnCans();
    }
    function stateHash() {
      const L = det.led;
      const o = {
        v: DET_VERSION, s: det.seed, t: det.tick, lh: det.layoutHash,
        gp: gearPicks.map(g => g.taken ? 1 : 0).join(''),
        p: [player.x, player.y, player.heading, state.inTruck ? 1 : 0, player.jump ? 1 : 0],
        g: state.gear, drb: state.drb, c: L.carried.map(c => c.id),
        L: [L.pendingGear, L.pendingByte, L.stash, L.bankedGear, L.bankedDrb, L.lostGear, L.lostCans, L.rig],
        d: garages.filter(g => g.doorOpen).map(g => g.id),
        rv: L.doors.map(d => [d.door, d.t]),
        r: L.repairs.map(r => [r.pole, r.t]),
        h: L.handoffs.map(h => h.t),
        pl: poles.map(p => p.on ? 1 : 0).join(''),
        db: debris.map(d => d.door),
        b: [byte.x, byte.y, byte.carrying ? 1 : 0, byte.nextT, byte.count],
        w: det.canWave, oc: oilCans.map(c => c.id).join(','),
        dep: L.deposits.map(d => [d.t, d.oilOk ? 1 : 0, d.gear])
      };
      const j = JSON.stringify(o);
      return fnv1a(j).toString(16).padStart(8, '0') + fnv1a(j, 0x9747b28c).toString(16).padStart(8, '0');
    }
    function sessionExport() {
      const L = det.led;
      return {
        v: DET_VERSION, seed: det.seed, seedLabel: det.seedLabel, ticks: det.tick, hash: stateHash(),
        pending: { gear: L.pendingGear, byte: L.pendingByte, stash: L.stash },
        banked: { gear: L.bankedGear, drbVerified: L.bankedDrb },
        lost: { gear: L.lostGear, cans: L.lostCans }, rigUses: L.rig,
        levels: {
          yard: { id: det.levels.yard.id, name: det.levels.yard.name, hash: det.levelHash.yard, layout: det.levels.yard },
          garage: { id: det.levels.garage.id, name: det.levels.garage.name, hash: det.levelHash.garage, layout: det.levels.garage }
        },
        repairs: L.repairs, byteHandoffs: L.handoffs, doors: L.doors, deposits: L.deposits,
        log: det.log
      };
    }
    // Headless replay (same seed + same log => same hash). Clobbers live state.
    function replay(seed, log, ticks, label, levels) {
      det.replaying = true;
      try {
        if (levels) applyLevels(levels.yard && (levels.yard.layout || levels.yard), levels.garage && (levels.garage.layout || levels.garage));
        resetSim(seed, label);
        let i = 0;
        for (let t = 0; t < ticks; t++) {
          while (i < log.length && log[i].t === t) {
            const e = log[i++];
            if (e.k === 'in') simIn = e.v.slice(); else applyAct(e);
          }
          update(TICK); det.tick++;
        }
        const ex = sessionExport(); delete ex.log;
        return ex;
      } finally { det.replaying = false; }
    }
    // Solvability: grid BFS with the real collision fn for the SUV AABB.
    function routeCheck(from, to, inTruck) {
      const hw = inTruck ? player.w * 0.48 : 5, hh = inTruck ? player.h * 0.48 : 5, st = 4;
      const x0 = Math.min(from.x, to.x) - 1200, x1 = Math.max(from.x, to.x) + 1200;
      const y0 = 30, y1 = world.height - 40;
      const W = Math.ceil((x1 - x0) / st), H = Math.ceil((y1 - y0) / st);
      const seen = new Uint8Array(W * H);
      const q = [];
      const sx = Math.round((from.x - x0) / st), sy = Math.round((from.y - y0) / st);
      q.push(sx, sy); seen[sy * W + sx] = 1;
      for (let qi = 0; qi < q.length; qi += 2) {
        const cx = q[qi], cy = q[qi + 1];
        const wx = x0 + cx * st, wy = y0 + cy * st;
        if (Math.abs(wx - to.x) <= st && Math.abs(wy - to.y) <= st) return true;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [ddx, ddy] of nb) {
          const nx = cx + ddx, ny = cy + ddy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
          seen[ny * W + nx] = 1;
          if (collidesAt(x0 + nx * st, y0 + ny * st, hw, hh, inTruck)) continue;
          q.push(nx, ny);
        }
      }
      return false;
    }
    const mazeStart = (() => { const g = rampGeom(defaultRamps()[0]); return { x: g.landX, y: g.landY }; })();
    const mazeGoal = { x: depositPad.x + depositPad.w / 2, y: depositPad.y + depositPad.h / 2 };

    function loop(time) {
      const dt = Math.min(0.25, (time - lastTime) / 1000);
      lastTime = time;
      loopAcc += dt;
      let n = 0;
      if (!det.ready || dev.on) loopAcc = 0;
      while (loopAcc >= TICK && n < 8) { detTick(); loopAcc -= TICK; n++; }
      if (n >= 8) loopAcc = 0;
      render();
      requestAnimationFrame(loop);
    }
    let loopAcc = 0;
    const LS_LOCAL = 'capsgarage.level.local';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} }
    det.ready = false; det.levelList = [];
    (function boot() {
      let q = null, want = { yard: null, garage: null }, dv = null;
      try { const sp = new URLSearchParams(location.search); q = sp.get('seed'); want.yard = sp.get('yard'); want.garage = sp.get('garage'); dv = sp.get('dev'); } catch (_) {}
      const parsed = parseSeed(q);
      const seed = parsed != null ? parsed : (Math.floor(Math.random() * 4294967296) >>> 0);
      const start = (Y, G) => {
        applyLevels(Y, G);
        resetSim(seed, q || String(seed));
        det.ready = true; updateHUD();
        if (dv === '1') enterDev();
      };
      const local = (area) => { if (want[area] !== 'local') return null; try { return JSON.parse(lsGet(LS_LOCAL + '.' + area)); } catch (_) { return null; } };
      const b = builtinLevels();
      if (typeof fetch !== 'function') { start(local('yard') || b.yard, local('garage') || b.garage); return; }
      fetch('levels/index.json', { cache: 'no-store' }).then(r => r.json()).then(idx => {
        det.levelList = (idx.levels || []);
        const load = (area) => {
          const lc = local(area); if (lc) return Promise.resolve(lc);
          const list = det.levelList.filter(l => l.area === area);
          const pick = list.find(l => l.id === want[area]) || list[0];
          if (!pick) return Promise.resolve(b[area]);
          return fetch('levels/' + pick.file, { cache: 'no-store' }).then(r => r.json()).then(L => Object.assign({ id: pick.id, name: pick.name }, L, { area }));
        };
        return Promise.all([load('yard'), load('garage')]).then(([Y, G]) => start(Y, G));
      }).catch(() => start(b.yard, b.garage));
    })();
    window.__garage = {
      applyLevels, builtinLevels, areaOf, applyLayout, builtinLayout, normLayout, layoutHashOf, crates, gearPicks,
      det, replay, stateHash, sessionExport, resetSim, routeCheck, mazeStart, mazeGoal,
      poles, garages, wrecks, debris, byte, player, state, ramps, depositPad,
      tick: (n) => { for (let i = 0; i < (n || 1); i++) detTick(); render(); },
      queueAct, applyAct
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

    function levelHref(area, id) {
      const sp = new URLSearchParams(location.search); sp.set(area, id); sp.delete('dev'); return '?' + sp.toString();
    }
    function openLevels() {
      const el = document.getElementById('session-panel');
      const group = (area, title) => {
        const cur = det.levels[area];
        const items = det.levelList.filter(l => l.area === area).map(l => `<a class="sx-lvl" href="${levelHref(area, l.id)}">${l.id === cur.id ? '▶ ' : ''}${l.name}</a>`);
        if (lsGet(LS_LOCAL + '.' + area)) items.push(`<a class="sx-lvl" href="${levelHref(area, 'local')}">🛠 My saved ${area} level (this device)</a>`);
        return `<div class="sx-group">${title}</div><div class="sx-row"><span>Now</span><b>${cur.name} · ${det.levelHash[area].slice(0, 8)}</b></div>${items.join('') || '<div class="sx-note">Offline — built-in level only.</div>'}`;
      };
      document.getElementById('session-body').innerHTML = group('yard', '🛢️ YARD levels (oil tank yard)') + group('garage', '🚪 GARAGE-AREA levels (bay rows + lot)');
      el.classList.add('show');
    }
    function openSession() {
      const ex = sessionExport();
      const el = document.getElementById('session-panel');
      const L = det.led;
      document.getElementById('session-body').innerHTML = `
        <div class="sx-row"><span>Seed</span><b>${det.seedLabel}${det.seedLabel !== String(det.seed) ? ' (' + det.seed + ')' : ''}</b></div>
        <div class="sx-row"><span>Yard level</span><b>${det.levels.yard.name} · ${det.levelHash.yard.slice(0, 8)}</b></div>
        <div class="sx-row"><span>Garage level</span><b>${det.levels.garage.name} · ${det.levelHash.garage.slice(0, 8)}</b></div>
        <div class="sx-row"><span>Tick</span><b>${det.tick} (${(det.tick / 60).toFixed(1)}s)</b></div>
        <div class="sx-row"><span>⏳ Pending GEAR</span><b>${L.pendingGear} doors + ${L.pendingByte} BYTE</b></div>
        <div class="sx-row"><span>🦴 Stash (uninstalled)</span><b>${L.stash}</b></div>
        <div class="sx-row"><span>🏦 Banked (claim later)</span><b>${L.bankedGear} GEAR · ${L.bankedDrb} DRB✅</b></div>
        <div class="sx-row"><span>☠️ Lost to traps</span><b>${L.lostGear} GEAR · ${L.lostCans} cans</b></div>
        <div class="sx-row"><span>💡 Lamps fixed</span><b>${L.repairs.length} / ${poles.length} (${poles.filter(p => p.on).length} lit)</b></div>
        <div class="sx-row"><span>🚪 Doors revealed</span><b>${L.doors.length} / 500</b></div>
        <div class="sx-row"><span>Rig uses</span><b>${L.rig}${L.rig ? ' ⚠️' : ''}</b></div>
        <div class="sx-hash">replay hash <b>${ex.hash}</b></div>
        <div class="sx-note">No tokens move yet. Seed + input log + hash export for future server verification.</div>`;
      el.classList.add('show');
    }
    function closeSession() { document.getElementById('session-panel').classList.remove('show'); }
    function exportSession(copy) {
      const txt = JSON.stringify(sessionExport());
      if (copy && navigator.clipboard) { navigator.clipboard.writeText(txt).then(() => showToast('📋 Session JSON copied')); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      a.download = `caps-garage-${det.seedLabel}-${det.tick}.json`;
      a.click();
    }
    function newSeedRun() {
      const s = Math.floor(Math.random() * 4294967296) >>> 0;
      location.search = '?seed=' + s;
    }

    function toggleBench() {
      const bench = document.getElementById('test-bench');
      bench.classList.toggle('collapsed');
      document.getElementById('bench-toggle-icon').innerText = bench.classList.contains('collapsed') ? '▲' : '▼';
    }
