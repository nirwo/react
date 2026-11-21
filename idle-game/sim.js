// Emberwake Idle — headless simulation: world, hero behaviour and the autopilot.
// No DOM access here so the same code drives live play, offline catch-up and tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.Sim = factory(root.GameData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  const { SKILLS, METALS, ITEMS, NODES, RECIPES, SOURCES, MOBS, UPGRADES, FOCUSES } = D;

  const MAX_LEVEL = 60;
  const MAX_TIER = METALS.length;
  const HERO_ATTACK = 1.2;
  const MOB_ATTACK = 1.6;
  const NONE = { none: true };
  const HOME = { x: 24, y: 16 };

  // Quick early levels, a long tail later on.
  const xpFor = (L) => 30 * (L - 1) ** 2 + 3 * (L - 1) ** 3;
  function levelOf(xp) {
    let lo = 1, hi = MAX_LEVEL;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xpFor(mid) <= xp) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- world

  const TERRAIN = { GRASS: 0, WATER: 1, SAND: 2, COBBLE: 3, FOREST: 4, ROCK: 5, EMBER: 6 };

  function buildWorld(seed) {
    const w = 48, h = 32;
    const terrain = new Uint8Array(w * h);
    const blocked = new Uint8Array(w * h);
    const taken = new Uint8Array(w * h);
    const rng = mulberry32(1337);
    const idx = (x, y) => y * w + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

    function ellipse(cx, cy, rx, ry, type, only) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (!inside(x, y)) continue;
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d <= 1 + (rng() - 0.5) * 0.25 && (only === undefined || terrain[idx(x, y)] === only))
            terrain[idx(x, y)] = type;
        }
    }
    ellipse(10, 15, 7, 6, TERRAIN.FOREST);
    ellipse(8, 5, 7.5, 4, TERRAIN.FOREST);
    ellipse(7, 26, 6.5, 4, TERRAIN.FOREST);
    ellipse(24, 4, 6.5, 3, TERRAIN.ROCK);
    ellipse(38, 5, 8.5, 4, TERRAIN.ROCK);
    ellipse(25, 27.5, 8.5, 3.6, TERRAIN.EMBER);
    for (const [cx, cy, rx, ry] of [[39, 16, 5, 3.6], [41, 27, 3.2, 2.2]]) {
      ellipse(cx, cy, rx + 1.3, ry + 1.3, TERRAIN.SAND);
      ellipse(cx, cy, rx, ry, TERRAIN.WATER);
    }
    for (let y = 13; y <= 18; y++) for (let x = 21; x <= 27; x++) terrain[idx(x, y)] = TERRAIN.COBBLE;
    for (let i = 0; i < w * h; i++) if (terrain[i] === TERRAIN.WATER) blocked[i] = 1;

    const stations = {
      stash: { id: 'stash', name: 'Stash', x: 23, y: 15 },
      forge: { id: 'forge', name: 'Forge', x: 25, y: 14 },
      campfire: { id: 'campfire', name: 'Campfire', x: 24, y: 17 },
    };
    for (const k in stations) {
      const s = stations[k];
      blocked[idx(s.x, s.y)] = 1; taken[idx(s.x, s.y)] = 1;
    }
    taken[idx(HOME.x, HOME.y)] = 1;

    const nodes = [];
    const mobs = [];

    function freeSpot(cx, cy, rx, ry, solid) {
      for (let tries = 0; tries < 400; tries++) {
        const x = Math.round(cx + (rng() * 2 - 1) * rx), y = Math.round(cy + (rng() * 2 - 1) * ry);
        if (!inside(x, y) || x < 1 || y < 1 || x > w - 2 || y > h - 2) continue;
        const i = idx(x, y);
        if (blocked[i] || taken[i] || terrain[i] === TERRAIN.COBBLE) continue;
        let crowded = false;
        if (solid) {
          // keep solid objects apart so every one of them stays reachable
          for (let dy = -1; dy <= 1 && !crowded; dy++)
            for (let dx = -1; dx <= 1; dx++) if (blocked[idx(x + dx, y + dy)]) { crowded = true; break; }
        }
        if (crowded) continue;
        return { x, y };
      }
      return null;
    }
    function scatterNodes(type, n, cx, cy, rx, ry) {
      for (let k = 0; k < n; k++) {
        const p = freeSpot(cx, cy, rx, ry, true);
        if (!p) continue;
        blocked[idx(p.x, p.y)] = 1; taken[idx(p.x, p.y)] = 1;
        nodes.push({ id: nodes.length, type, x: p.x, y: p.y, charges: 5, respawn: 0 });
      }
    }
    function fishSpots(type, n, cx, cy, rx, ry, pred) {
      const shore = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          if (terrain[idx(x, y)] !== TERRAIN.WATER || taken[idx(x, y)] || !pred(x, y)) continue;
          if (Math.abs(x - cx) > rx + 1 || Math.abs(y - cy) > ry + 1) continue;
          const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !blocked[idx(x + dx, y + dy)]);
          if (land) shore.push({ x, y });
        }
      for (let k = 0; k < n && shore.length; k++) {
        const p = shore.splice(Math.floor(rng() * shore.length), 1)[0];
        taken[idx(p.x, p.y)] = 1;
        nodes.push({ id: nodes.length, type, x: p.x, y: p.y, charges: 5, respawn: 0 });
      }
    }
    function scatterMobs(type, n, cx, cy, rx, ry) {
      for (let k = 0; k < n; k++) {
        const p = freeSpot(cx, cy, rx, ry, false);
        if (!p) continue;
        taken[idx(p.x, p.y)] = 1;
        mobs.push({ id: mobs.length, type, x: p.x, y: p.y, hp: MOBS[type].hp, respawn: 0, atkT: 0 });
      }
    }

    scatterNodes('ashwood', 9, 10, 15, 5, 4);
    scatterNodes('ironbark', 7, 8, 5, 6, 3);
    scatterNodes('moonwillow', 6, 7, 26, 5, 3);
    scatterNodes('copper_rock', 7, 24, 4, 5, 2);
    scatterNodes('iron_rock', 6, 34, 5, 3, 3);
    scatterNodes('skysteel_rock', 5, 42, 4, 3, 2);
    scatterNodes('emberite_rock', 5, 25, 28, 7, 2);
    fishSpots('minnow_spot', 4, 39, 16, 5, 4, (x) => x < 39);
    fishSpots('riverfin_spot', 4, 39, 16, 5, 4, (x) => x >= 39);
    fishSpots('glowfin_spot', 3, 41, 27, 3, 2, () => true);
    scatterMobs('slime', 5, 24, 21, 5, 1);
    scatterMobs('thornrat', 4, 16, 9, 3, 2);
    scatterMobs('duskwolf', 4, 8, 5, 6, 3);
    scatterMobs('marauder', 4, 31, 12, 3, 2);
    scatterMobs('cragback', 3, 40, 7, 5, 2);
    scatterMobs('wyrm', 1, 25, 27, 2, 1);

    return {
      w, h, terrain, blocked, nodes, mobs, stations,
      rng: mulberry32(seed === undefined ? (Date.now() & 0xffffffff) : seed),
      events: [], quiet: false,
      rt: freshRuntime(),
      _prev: new Int32Array(w * h), _queue: new Int32Array(w * h),
    };
  }

  function freshRuntime() {
    return { path: [], pathKey: null, pathRef: null, act: 'idle', target: null, actT: 0, atkT: 0, eatT: 0 };
  }

  // Breadth-first search from (sx,sy) to the nearest tile in `goals` (Map tileIndex -> ref).
  function bfs(W, sx, sy, goals) {
    const { w, h, blocked, _prev: prev, _queue: q } = W;
    const start = sy * w + sx;
    if (goals.has(start)) return { path: [], ref: goals.get(start) };
    prev.fill(-1);
    prev[start] = start;
    let head = 0, tail = 0;
    q[tail++] = start;
    while (head < tail) {
      const cur = q[head++];
      const cx = cur % w, cy = (cur - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (prev[n] !== -1 || blocked[n]) continue;
        prev[n] = cur;
        if (goals.has(n)) {
          const path = [];
          for (let c = n; c !== start; c = prev[c]) path.push([c % w, (c - (c % w)) / w]);
          path.reverse();
          return { path, ref: goals.get(n) };
        }
        q[tail++] = n;
      }
    }
    return null;
  }

  function standTiles(W, targets) {
    const goals = new Map();
    for (const t of targets)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx, y = t.y + dy;
        if (x < 0 || y < 0 || x >= W.w || y >= W.h || W.blocked[y * W.w + x]) continue;
        if (!goals.has(y * W.w + x)) goals.set(y * W.w + x, t);
      }
    return goals;
  }

  // ---------------------------------------------------------------- state

  function newState() {
    const xp = {};
    for (const k in SKILLS) xp[k] = 0;
    return {
      v: 1, t: 0,
      hero: { x: HOME.x, y: HOME.y, hp: 24, ko: 0, face: 1 },
      xp, inv: {}, pouch: {}, stash: {},
      gear: { weapon: 0, armor: 0, axe: 0, pick: 0 },
      gold: 0, upgrades: { pack: 0, boots: 0, pouch: 0, whetstone: 0, charm: 0 },
      auto: true, focus: 'balanced', goal: null, dirN: 0,
      stats: { kills: 0, kos: 0, gathered: 0, crafted: 0, earned: 0 },
      savedAt: 0,
    };
  }

  // Merge a saved game over fresh defaults so older saves keep loading.
  function hydrate(saved) {
    const S = newState();
    if (!saved || typeof saved !== 'object') return S;
    for (const k of ['t', 'gold', 'auto', 'focus', 'dirN', 'savedAt'])
      if (typeof saved[k] === typeof S[k]) S[k] = saved[k];
    for (const k of ['hero', 'xp', 'inv', 'pouch', 'stash', 'gear', 'upgrades', 'stats'])
      if (saved[k] && typeof saved[k] === 'object') Object.assign(S[k], saved[k]);
    if (!FOCUSES[S.focus]) S.focus = 'balanced';
    S.hero.x = Math.round(S.hero.x); S.hero.y = Math.round(S.hero.y);
    if (saved.goal && !S.auto && validGoal(saved.goal)) {
      const g = saved.goal;
      S.goal = { kind: g.kind, node: g.node, mob: g.mob, recipe: g.recipe, left: g.left == null ? null : g.left, why: g.why };
    }
    return S;
  }
  function validGoal(g) {
    return (g.kind === 'gather' && NODES[g.node]) || (g.kind === 'fight' && MOBS[g.mob]) || (g.kind === 'craft' && RECIPES[g.recipe]);
  }

  const lvl = (S, k) => levelOf(S.xp[k]);
  const maxHp = (S) => 20 + 4 * lvl(S, 'combat');
  const packCap = (S) => 20 + 6 * S.upgrades.pack;
  const pouchCap = (S) => 6 + 3 * S.upgrades.pouch;
  const heroSpeed = (S) => 4 * (1 + 0.08 * S.upgrades.boots);
  const count = (bag) => { let n = 0; for (const k in bag) n += bag[k]; return n; };
  const owned = (S, item) => (S.stash[item] || 0) + (S.inv[item] || 0);
  const upgradeCost = (id, n) => Math.floor(UPGRADES[id].base * Math.pow(UPGRADES[id].growth, n));

  function add(bag, item, n) {
    bag[item] = (bag[item] || 0) + n;
    if (bag[item] <= 0) delete bag[item];
  }
  function emit(W, ev) {
    if (W.quiet) return;
    W.events.push(ev);
    if (W.events.length > 200) W.events.splice(0, 100);
  }
  const log = (W, text, tone) => emit(W, { type: 'log', text, tone });
  const float = (W, x, y, text, color) => emit(W, { type: 'float', x, y, text, color });

  function addXp(S, W, skill, amount) {
    const before = lvl(S, skill);
    S.xp[skill] += amount * (1 + 0.04 * S.upgrades.charm);
    const after = lvl(S, skill);
    if (after > before) {
      log(W, `${SKILLS[skill].name} reached level ${after}!`, 'good');
      float(W, S.hero.x, S.hero.y - 0.9, `${SKILLS[skill].name} ${after}`, '#ffe08a');
      if (skill === 'combat') S.hero.hp = Math.min(maxHp(S), S.hero.hp + 4 * (after - before));
    }
  }

  function gatherTime(S, nt) {
    const tool = nt.skill === 'woodcutting' ? S.gear.axe : nt.skill === 'mining' ? S.gear.pick : 0;
    return nt.time * (1 - 0.12 * tool) * Math.max(0.5, 1 - 0.006 * (lvl(S, nt.skill) - nt.level));
  }
  const heroBaseDamage = (S) => (1 + lvl(S, 'combat') * 0.5 + S.gear.weapon * 4) * (1 + 0.05 * S.upgrades.whetstone);
  const mobAvgDamage = (S, mt) => Math.max(1, mt.atk * 0.75 - S.gear.armor * 2.5 - lvl(S, 'combat') * 0.1);

  // Expected damage the hero takes killing one of these, as a fraction of max HP.
  function threat(S, mt) {
    const ttk = mt.hp / ((heroBaseDamage(S) * 0.8) / HERO_ATTACK);
    return (ttk * mobAvgDamage(S, mt)) / MOB_ATTACK / maxHp(S);
  }

  function canCraft(S, r) {
    if (lvl(S, r.skill) < r.level) return false;
    if (r.gear && S.gear[r.gear.slot] >= r.gear.tier) return false;
    for (const item in r.in) if ((S.stash[item] || 0) + (S.inv[item] || 0) < r.in[item]) return false;
    return true;
  }

  // ---------------------------------------------------------------- shop

  function buyUpgrade(S, W, id) {
    const n = S.upgrades[id];
    if (n >= UPGRADES[id].max) return false;
    const cost = upgradeCost(id, n);
    if (S.gold < cost) return false;
    S.gold -= cost;
    S.upgrades[id] = n + 1;
    log(W, `Bought ${UPGRADES[id].name} (rank ${n + 1}) for ${cost} gold.`, 'gold');
    return true;
  }

  // Sell everything in the stash above a working reserve.
  function sellSurplus(S, W) {
    let total = 0;
    for (const item in S.stash) {
      const keep = ITEMS[item].heal ? 30 : 24;
      const extra = S.stash[item] - keep;
      if (extra > 0) { total += extra * ITEMS[item].value; add(S.stash, item, -extra); }
    }
    if (total > 0) {
      S.gold += total; S.stats.earned += total;
      log(W, `Sold surplus goods for ${total} gold.`, 'gold');
    }
    return total;
  }

  // ---------------------------------------------------------------- autopilot

  function feasible(S, id) {
    const r = RECIPES[id];
    if (lvl(S, r.skill) < r.level) return false;
    for (const item in r.in) {
      const src = SOURCES[item];
      if (src.recipe ? !feasible(S, src.recipe) : lvl(S, NODES[src.node].skill) < NODES[src.node].level) return false;
    }
    return true;
  }
  // The first skill whose level is holding a recipe back, if any.
  function blocker(S, id) {
    const r = RECIPES[id];
    if (lvl(S, r.skill) < r.level) return r.skill;
    for (const item in r.in) {
      const src = SOURCES[item];
      if (src.recipe) { const b = blocker(S, src.recipe); if (b) return b; }
      else if (lvl(S, NODES[src.node].skill) < NODES[src.node].level) return NODES[src.node].skill;
    }
    return null;
  }
  // Work backwards from a recipe to the next concrete thing to do for it.
  function nextStep(S, id, times, why) {
    const r = RECIPES[id];
    for (const item in r.in) {
      const need = r.in[item] * times, have = owned(S, item);
      if (have >= need) continue;
      const src = SOURCES[item];
      if (src.recipe) return nextStep(S, src.recipe, need - have, why);
      return { kind: 'gather', node: src.node, left: need - have, why: `${why} — gathering ${need - have} ${ITEMS[item].name}` };
    }
    return { kind: 'craft', recipe: id, left: times, why: `${why} — ${r.verb} ${r.name}` };
  }

  function bestNode(S, skill, extra) {
    let best = null;
    for (const id in NODES) {
      const n = NODES[id];
      if (n.skill !== skill || n.level > lvl(S, skill) || (extra && !extra(n))) continue;
      if (!best || n.level > NODES[best].level) best = id;
    }
    return best;
  }
  function bestCookable(S) {
    let best = null;
    for (const id in RECIPES) {
      const r = RECIPES[id];
      if (r.skill !== 'cooking' || !canCraft(S, r)) continue;
      if (!best || r.level > RECIPES[best].level) best = id;
    }
    return best;
  }
  const cookFor = (rawItem) => 'cook_' + rawItem.slice(4);
  const bestFishToCook = (S) => bestNode(S, 'fishing', (n) => RECIPES[cookFor(n.item)].level <= lvl(S, 'cooking'));
  function bestMob(S) {
    let best = 'slime';
    for (const id in MOBS) if (threat(S, MOBS[id]) <= 0.6 && MOBS[id].level > MOBS[best].level) best = id;
    return best;
  }
  function mealCount(S) {
    let n = count(S.pouch);
    for (const item in S.stash) if (ITEMS[item].heal) n += S.stash[item];
    return n;
  }
  function rawFishCount(S) {
    let n = 0;
    for (const id in RECIPES) if (RECIPES[id].skill === 'cooking' && lvl(S, 'cooking') >= RECIPES[id].level)
      for (const item in RECIPES[id].in) n += owned(S, item);
    return n;
  }

  function cookAll(S, why) {
    const id = bestCookable(S);
    const raw = Object.keys(RECIPES[id].in)[0];
    return { kind: 'craft', recipe: id, left: owned(S, raw), why };
  }
  function foodGoal(S) {
    if (mealCount(S) >= 6) return null;
    if (rawFishCount(S) >= 6 && bestCookable(S)) return cookAll(S, 'Low on meals — cooking the catch');
    const node = bestFishToCook(S);
    return { kind: 'gather', node, left: 12, why: `Low on meals — fishing at a ${NODES[node].name}` };
  }
  function nextGear(S, slots) {
    let pick = null;
    for (const slot of slots) {
      const tier = S.gear[slot] + 1;
      if (tier > MAX_TIER) continue;
      const id = METALS[tier - 1].id + '_' + slot;
      if (!pick || tier < pick.tier) pick = { id, tier };
    }
    return pick;
  }
  function gearGoal(S) {
    const order = S.focus === 'gathering' ? ['pick', 'axe', 'weapon', 'armor'] : ['weapon', 'pick', 'axe', 'armor'];
    let best = null;
    for (const slot of order) {
      const tier = S.gear[slot] + 1;
      if (tier > MAX_TIER) continue;
      const id = METALS[tier - 1].id + '_' + slot;
      if (feasible(S, id) && (!best || tier < best.tier)) best = { id, tier };
    }
    return best && nextStep(S, best.id, 1, `Upgrade: ${RECIPES[best.id].name}`);
  }
  function train(S, skill) {
    const name = SKILLS[skill].name;
    if (skill === 'cooking') {
      if (bestCookable(S)) return cookAll(S, 'Training Cooking');
      const node = bestFishToCook(S);
      return { kind: 'gather', node, left: 15, why: `Training Cooking — catching fish at a ${NODES[node].name}` };
    }
    if (skill === 'smithing') {
      let bar = null;
      for (const m of METALS) if (feasible(S, m.id + '_bar')) bar = m.id + '_bar';
      return nextStep(S, bar, 6, 'Training Smithing');
    }
    if (skill === 'combat') {
      const mob = bestMob(S);
      return { kind: 'fight', mob, left: 6, why: `Training Combat — hunting ${MOBS[mob].name}s` };
    }
    const node = bestNode(S, skill);
    return { kind: 'gather', node, left: 20, why: `Training ${name} at a ${NODES[node].name}` };
  }
  function focusGoal(S) {
    if (S.focus === 'combat' && S.dirN % 2 === 0) {
      // A pure fighter still needs better steel: periodically work on whatever blocks it.
      const g = nextGear(S, ['weapon', 'armor']);
      const b = g && blocker(S, g.id);
      if (b) { const t = train(S, b); t.why += ` (needed for ${RECIPES[g.id].name})`; return t; }
    }
    let low = null;
    for (const k of FOCUSES[S.focus].skills) if (low === null || lvl(S, k) < lvl(S, low)) low = k;
    return train(S, low);
  }

  function direct(S, W) {
    sellSurplus(S, W);
    for (;;) {
      let cheapest = null;
      for (const id in UPGRADES)
        if (S.upgrades[id] < UPGRADES[id].max && (!cheapest || upgradeCost(id, S.upgrades[id]) < upgradeCost(cheapest, S.upgrades[cheapest]))) cheapest = id;
      if (!cheapest || !buyUpgrade(S, W, cheapest)) break;
    }
    S.dirN++;
    setGoal(S, W, foodGoal(S) || gearGoal(S) || focusGoal(S));
  }

  function setGoal(S, W, goal) {
    S.goal = goal;
    W.rt.pathKey = null;
  }

  // ---------------------------------------------------------------- hero behaviour

  function setAct(W, act, target) {
    const rt = W.rt;
    if (rt.act !== act || rt.target !== target) { rt.act = act; rt.target = target || null; rt.actT = 0; }
  }

  function walk(S, W, dt) {
    const h = S.hero, rt = W.rt;
    let move = heroSpeed(S) * dt;
    while (move > 0 && rt.path.length) {
      const [nx, ny] = rt.path[0];
      const dx = nx - h.x, dy = ny - h.y, d = Math.hypot(dx, dy);
      if (dx) h.face = dx > 0 ? 1 : -1;
      if (d <= move) { h.x = nx; h.y = ny; rt.path.shift(); move -= d; }
      else { h.x += (dx / d) * move; h.y += (dy / d) * move; move = 0; }
    }
  }

  // Walk next to the nearest of `targets()`. Returns the target once adjacent,
  // NONE when nothing is reachable, or null while still on the way.
  function seek(S, W, dt, key, targets) {
    const h = S.hero, rt = W.rt;
    if (rt.pathKey !== key) {
      if (!Number.isInteger(h.x) || !Number.isInteger(h.y)) {
        rt.path.length = Math.min(rt.path.length, 1); // finish the current step first
        setAct(W, 'walk'); walk(S, W, dt);
        return null;
      }
      const res = bfs(W, h.x, h.y, standTiles(W, targets()));
      if (!res) { rt.path = []; rt.pathKey = null; return NONE; }
      rt.pathKey = key; rt.path = res.path; rt.pathRef = res.ref;
    }
    if (rt.path.length) {
      setAct(W, 'walk'); walk(S, W, dt);
      if (rt.path.length) return null;
    }
    return rt.pathRef;
  }

  function visitStash(S, W, dt) {
    const at = seek(S, W, dt, 'stash', () => [W.stations.stash]);
    if (!at || at === NONE) return false;
    for (const item in S.inv) add(S.stash, item, S.inv[item]);
    S.inv = {};
    // top the ration pouch up with the best meals on hand
    const meals = Object.keys(S.stash).filter((i) => ITEMS[i].heal).sort((a, b) => ITEMS[b].heal - ITEMS[a].heal);
    let room = pouchCap(S) - count(S.pouch);
    for (const item of meals) {
      const n = Math.min(room, S.stash[item]);
      if (n > 0) { add(S.stash, item, -n); add(S.pouch, item, n); room -= n; }
    }
    W.rt.pathKey = null;
    return true;
  }

  function eat(S, W) {
    let best = null;
    for (const item in S.pouch) if (!best || ITEMS[item].heal > ITEMS[best].heal) best = item;
    if (!best) return false;
    add(S.pouch, best, -1);
    S.hero.hp = Math.min(maxHp(S), S.hero.hp + ITEMS[best].heal);
    float(W, S.hero.x, S.hero.y - 0.8, `+${ITEMS[best].heal}`, '#8fe08f');
    W.rt.eatT = 1.5;
    return true;
  }

  function finishStep(S, W, g) {
    if (g.left != null && --g.left <= 0) setGoal(S, W, null);
  }

  function runGather(S, W, dt, g) {
    const nt = NODES[g.node];
    if (count(S.inv) >= packCap(S)) { visitStash(S, W, dt); return; }
    const node = seek(S, W, dt, 'node:' + g.node, () => W.nodes.filter((n) => n.type === g.node && n.charges > 0));
    if (node === NONE) { setAct(W, 'wait'); return; }
    if (!node) return;
    if (node.charges <= 0) { W.rt.pathKey = null; return; }
    setAct(W, 'gather', node);
    S.hero.face = node.x >= S.hero.x ? 1 : -1;
    W.rt.actT += dt;
    if (W.rt.actT < gatherTime(S, nt)) return;
    W.rt.actT = 0;
    add(S.inv, nt.item, 1);
    S.stats.gathered++;
    float(W, node.x, node.y - 0.6, `+1 ${ITEMS[nt.item].name}`, nt.color);
    addXp(S, W, nt.skill, nt.xp);
    if (--node.charges <= 0) { node.respawn = 9 + W.rng() * 6; W.rt.pathKey = null; }
    finishStep(S, W, g);
  }

  function runCraft(S, W, dt, g) {
    const r = RECIPES[g.recipe];
    if (!canCraft(S, r)) { setGoal(S, W, null); return; }
    if (count(S.inv) > 0) { visitStash(S, W, dt); return; }
    const st = seek(S, W, dt, 'station:' + r.station, () => [W.stations[r.station]]);
    if (!st || st === NONE) return;
    setAct(W, 'craft', st);
    S.hero.face = st.x >= S.hero.x ? 1 : -1;
    W.rt.actT += dt;
    if (W.rt.actT < r.time) return;
    W.rt.actT = 0;
    for (const item in r.in) add(S.stash, item, -r.in[item]);
    for (const item in r.out) add(S.stash, item, r.out[item]);
    S.stats.crafted++;
    if (r.gear) {
      S.gear[r.gear.slot] = r.gear.tier;
      log(W, `Forged and equipped: ${r.name}!`, 'good');
      float(W, st.x, st.y - 0.8, r.name, '#ffe08a');
    } else float(W, st.x, st.y - 0.6, `+1 ${r.name}`, '#e8d9b0');
    addXp(S, W, r.skill, r.xp);
    finishStep(S, W, g);
  }

  function knockOut(S, W, mt) {
    const h = S.hero, lost = Math.floor(S.gold * 0.1);
    S.gold -= lost; S.stats.kos++;
    h.ko = 5; h.x = HOME.x; h.y = HOME.y; h.hp = 1;
    W.rt = freshRuntime();
    log(W, `Knocked out by a ${mt.name}${lost ? ` — dropped ${lost} gold` : ''}. Recovering in town.`, 'bad');
    setGoal(S, W, null);
  }

  function runFight(S, W, dt, g) {
    const h = S.hero, rt = W.rt, mt = MOBS[g.mob], hpMax = maxHp(S);
    const stashMeals = () => Object.keys(S.stash).some((i) => ITEMS[i].heal);
    if (!g.prepped) {
      if (count(S.pouch) < pouchCap(S) / 2 && stashMeals()) { if (!visitStash(S, W, dt)) return; }
      g.prepped = true;
    }
    if (!g.retreat && h.hp < hpMax * 0.4 && count(S.pouch) === 0) {
      g.retreat = true; g.atStash = false;
      if (rt.target && rt.target.type) rt.target.hp = MOBS[rt.target.type].hp; // it recovers while we run
    }
    if (g.retreat) {
      if (!g.atStash) { if (visitStash(S, W, dt)) g.atStash = true; return; }
      if (count(S.pouch) > 0) g.retreat = false;
      else if (S.auto) { setGoal(S, W, null); return; }
      else {
        setAct(W, 'rest');
        h.hp = Math.min(hpMax, h.hp + hpMax * 0.05 * dt);
        if (h.hp >= hpMax * 0.8) g.retreat = false;
        return;
      }
    }
    if (h.hp < hpMax * 0.5 && rt.eatT <= 0) eat(S, W);

    const mob = seek(S, W, dt, 'mob:' + g.mob, () => W.mobs.filter((m) => m.type === g.mob && m.hp > 0));
    if (mob === NONE) { setAct(W, 'wait'); return; }
    if (!mob) return;
    if (mob.hp <= 0) { rt.pathKey = null; return; }
    if (rt.target !== mob) { rt.atkT = 0; mob.atkT = 0; }
    setAct(W, 'fight', mob);
    h.face = mob.x >= h.x ? 1 : -1;
    rt.actT += dt;
    rt.atkT += dt; mob.atkT += dt;
    if (rt.atkT >= HERO_ATTACK) {
      rt.atkT -= HERO_ATTACK;
      const dmg = Math.max(1, Math.round(heroBaseDamage(S) * (0.6 + 0.4 * W.rng())));
      mob.hp -= dmg;
      emit(W, { type: 'hit', x: mob.x, y: mob.y });
      float(W, mob.x, mob.y - 0.7, `${dmg}`, '#ffffff');
      if (mob.hp <= 0) {
        mob.hp = 0; mob.respawn = mt.respawn;
        const gold = Math.round(mt.gold[0] + W.rng() * (mt.gold[1] - mt.gold[0]));
        S.gold += gold; S.stats.earned += gold; S.stats.kills++;
        float(W, mob.x, mob.y - 1.1, `+${gold}g`, '#ffd34d');
        if (mt.boss) log(W, `The ${mt.name} has fallen! (+${gold} gold)`, 'good');
        addXp(S, W, 'combat', mt.xp);
        rt.pathKey = null;
        setAct(W, 'idle');
        finishStep(S, W, g);
        return;
      }
    }
    if (mob.atkT >= MOB_ATTACK) {
      mob.atkT -= MOB_ATTACK;
      const dmg = Math.max(1, Math.round(mt.atk * (0.5 + 0.5 * W.rng()) - S.gear.armor * 2.5 - lvl(S, 'combat') * 0.1));
      h.hp -= dmg;
      float(W, h.x, h.y - 0.7, `-${dmg}`, '#ff7b6b');
      if (h.hp <= 0) { mob.hp = mt.hp; knockOut(S, W, mt); }
    }
  }

  // ---------------------------------------------------------------- main loop

  function step(S, W, dt) {
    S.t += dt;
    for (const n of W.nodes) if (n.charges <= 0 && (n.respawn -= dt) <= 0) n.charges = 4 + Math.floor(W.rng() * 4);
    for (const m of W.mobs) if (m.hp <= 0 && (m.respawn -= dt) <= 0) { m.hp = MOBS[m.type].hp; m.atkT = 0; }

    const h = S.hero, rt = W.rt;
    if (h.ko > 0) {
      h.ko -= dt;
      rt.act = 'ko';
      if (h.ko <= 0) { h.hp = maxHp(S); rt.act = 'idle'; }
      return;
    }
    if (rt.eatT > 0) rt.eatT -= dt;
    if (rt.act !== 'fight') h.hp = Math.min(maxHp(S), h.hp + maxHp(S) * 0.01 * dt);

    if (S.auto && !S.goal) direct(S, W);
    const g = S.goal;
    if (!g) { setAct(W, 'idle'); return; }
    if (g.kind === 'gather') runGather(S, W, dt, g);
    else if (g.kind === 'craft') runCraft(S, W, dt, g);
    else if (g.kind === 'fight') runFight(S, W, dt, g);
  }

  // Fast-forward (offline progress). Returns a summary of what changed.
  function simulate(S, W, seconds, dt) {
    dt = dt || 0.25;
    const before = { levels: {}, gold: S.gold, gear: Object.assign({}, S.gear), kills: S.stats.kills };
    for (const k in SKILLS) before.levels[k] = lvl(S, k);
    const wasQuiet = W.quiet;
    W.quiet = true;
    for (let t = 0; t < seconds; t += dt) step(S, W, dt);
    W.quiet = wasQuiet;
    const levels = {};
    for (const k in SKILLS) if (lvl(S, k) > before.levels[k]) levels[k] = [before.levels[k], lvl(S, k)];
    const gear = [];
    for (const slot in S.gear) if (S.gear[slot] > before.gear[slot]) gear.push(RECIPES[METALS[S.gear[slot] - 1].id + '_' + slot].name);
    return { seconds, levels, gear, gold: S.gold - before.gold, kills: S.stats.kills - before.kills };
  }

  // A goal chosen by the player (runs until changed).
  function manualGoal(S, W, goal) {
    S.auto = false;
    goal.left = goal.left === undefined ? null : goal.left;
    setGoal(S, W, goal);
  }

  function describeGoal(S, W) {
    if (S.hero.ko > 0) return 'Knocked out — recovering in town';
    const g = S.goal;
    if (!g) return S.auto ? 'Thinking…' : 'Idle — click something on the map, or switch the autopilot on';
    if (g.why) return g.why;
    if (g.kind === 'gather') return `Gathering at ${NODES[g.node].name}s`;
    if (g.kind === 'fight') return `Hunting ${MOBS[g.mob].name}s`;
    return `${RECIPES[g.recipe].verb[0].toUpperCase()}${RECIPES[g.recipe].verb.slice(1)} ${RECIPES[g.recipe].name}`;
  }

  return {
    TERRAIN, MAX_LEVEL, HOME, NONE,
    buildWorld, newState, hydrate, step, simulate, direct, manualGoal, describeGoal,
    bfs, standTiles, xpFor, levelOf, lvl, maxHp, packCap, pouchCap, count, owned,
    canCraft, feasible, threat, gatherTime, upgradeCost, buyUpgrade, sellSurplus, mealCount,
  };
});
