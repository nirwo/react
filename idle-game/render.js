// Emberwake Idle — canvas renderer. Everything is drawn procedurally; there are no image assets.
(function (root) {
  const { NODES, MOBS, METALS } = root.GameData;
  const Sim = root.Sim;
  const T = 24; // tile size in world pixels
  const TR = Sim.TERRAIN;

  const GROUND = {
    [TR.GRASS]: ['#4f7f42', '#4a783e', '#548646'],
    [TR.WATER]: ['#2f6f9f', '#2c6a99', '#3376a8'],
    [TR.SAND]: ['#cdb97a', '#c6b272', '#d3c084'],
    [TR.COBBLE]: ['#8d877a', '#878174', '#948e81'],
    [TR.FOREST]: ['#3c6436', '#385e33', '#41693a'],
    [TR.ROCK]: ['#7b796f', '#74726a', '#838177'],
    [TR.EMBER]: ['#5b3b35', '#543631', '#63413a'],
  };
  const TIER_COLOR = ['#8a6f4d'].concat(METALS.map((m) => m.color));
  const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  function Renderer(canvas, W) {
    this.canvas = canvas;
    this.W = W;
    this.ctx = canvas.getContext('2d');
    this.floats = [];
    this.flash = new Map();
    this.time = 0;
    this.hover = null;
    this.ground = this.paintGround();
    this.resize();
  }

  Renderer.prototype.resize = function () {
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || this.W.w * T;
    this.scale = (cssW * dpr) / (this.W.w * T);
    this.canvas.width = Math.round(this.W.w * T * this.scale);
    this.canvas.height = Math.round(this.W.h * T * this.scale);
  };

  Renderer.prototype.paintGround = function () {
    const W = this.W, c = document.createElement('canvas');
    c.width = W.w * T; c.height = W.h * T;
    const g = c.getContext('2d');
    for (let y = 0; y < W.h; y++)
      for (let x = 0; x < W.w; x++) {
        const t = W.terrain[y * W.w + x], r = hash(x, y);
        g.fillStyle = GROUND[t][Math.floor(r * 3)];
        g.fillRect(x * T, y * T, T, T);
        const px = x * T, py = y * T;
        if (t === TR.GRASS || t === TR.FOREST) {
          g.fillStyle = t === TR.GRASS ? 'rgba(160,210,120,.35)' : 'rgba(120,170,100,.3)';
          for (let k = 0; k < 3; k++) g.fillRect(px + hash(x + k * 7, y) * 20 + 1, py + hash(x, y + k * 5) * 20 + 1, 2, 3);
          if (r > 0.93 && t === TR.GRASS) { g.fillStyle = r > 0.965 ? '#f4e9a1' : '#e9a6c1'; g.fillRect(px + 10, py + 9, 3, 3); }
        } else if (t === TR.COBBLE) {
          g.strokeStyle = 'rgba(40,36,30,.35)'; g.lineWidth = 1;
          g.strokeRect(px + 0.5, py + 0.5, T - 1, T / 2 - 1);
          g.strokeRect(px + (y % 2 ? 0 : T / 2) + 0.5 - T / 2, py + T / 2 + 0.5, T - 1, T / 2 - 1);
        } else if (t === TR.ROCK || t === TR.EMBER) {
          g.fillStyle = t === TR.ROCK ? 'rgba(50,50,46,.3)' : 'rgba(255,120,60,.25)';
          for (let k = 0; k < 2; k++) g.fillRect(px + hash(x + k * 3, y + 1) * 18 + 2, py + hash(x + 2, y + k * 9) * 18 + 2, 4, 2);
        } else if (t === TR.SAND) {
          g.fillStyle = 'rgba(120,100,50,.25)';
          g.fillRect(px + r * 18 + 2, py + hash(y, x) * 18 + 2, 2, 2);
        }
      }
    // soft shoreline
    g.strokeStyle = 'rgba(230,245,255,.45)'; g.lineWidth = 2;
    for (let y = 0; y < W.h; y++)
      for (let x = 0; x < W.w; x++) {
        if (W.terrain[y * W.w + x] !== TR.WATER) continue;
        const land = (dx, dy) => W.terrain[(y + dy) * W.w + x + dx] !== TR.WATER;
        g.beginPath();
        if (land(0, -1)) { g.moveTo(x * T, y * T + 1); g.lineTo(x * T + T, y * T + 1); }
        if (land(0, 1)) { g.moveTo(x * T, y * T + T - 1); g.lineTo(x * T + T, y * T + T - 1); }
        if (land(-1, 0)) { g.moveTo(x * T + 1, y * T); g.lineTo(x * T + 1, y * T + T); }
        if (land(1, 0)) { g.moveTo(x * T + T - 1, y * T); g.lineTo(x * T + T - 1, y * T + T); }
        g.stroke();
      }
    return c;
  };

  Renderer.prototype.consume = function (events) {
    for (const ev of events) {
      if (ev.type === 'float') {
        if (this.floats.length > 40) this.floats.shift();
        this.floats.push({ x: ev.x, y: ev.y, text: ev.text, color: ev.color, age: 0 });
      } else if (ev.type === 'hit') this.flash.set(ev.x + ',' + ev.y, 0.15);
    }
  };

  const ell = (g, x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const shadow = (g, x, y, r) => ell(g, x, y + T * 0.36, r, r * 0.4, 'rgba(0,0,0,.25)');

  function drawTree(g, n, nt) {
    const x = n.x * T + T / 2, y = n.y * T + T / 2;
    shadow(g, x, y, 10);
    g.fillStyle = '#6b4a2e';
    if (n.charges <= 0) { g.fillRect(x - 4, y + 2, 8, 7); ell(g, x, y + 2, 4, 2, '#a98458'); return; }
    g.fillRect(x - 3, y - 2, 6, 12);
    const sway = Math.sin(n.id * 2.1 + performance.now() / 900) * 0.8;
    ell(g, x + sway, y - 8, 11, 10, 'rgba(0,0,0,.18)');
    ell(g, x - 5 + sway, y - 7, 7, 7, nt.color);
    ell(g, x + 5 + sway, y - 7, 7, 7, nt.color);
    ell(g, x + sway, y - 13, 8, 8, nt.color);
    ell(g, x - 2 + sway, y - 15, 4, 3, 'rgba(255,255,255,.22)');
  }
  function drawRock(g, n, nt) {
    const x = n.x * T + T / 2, y = n.y * T + T / 2, dead = n.charges <= 0;
    shadow(g, x, y, 11);
    g.fillStyle = dead ? '#5d5b55' : '#8f8d86';
    g.beginPath();
    g.moveTo(x - 10, y + 8); g.lineTo(x - 8, y - 2); g.lineTo(x - 2, y - 9); g.lineTo(x + 6, y - 7); g.lineTo(x + 10, y + 1); g.lineTo(x + 9, y + 8);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.beginPath(); g.moveTo(x - 8, y - 2); g.lineTo(x - 2, y - 9); g.lineTo(x + 1, y - 3); g.closePath(); g.fill();
    if (dead) return;
    g.fillStyle = nt.color;
    for (const [dx, dy] of [[-4, 1], [3, -3], [5, 4], [-1, 5]]) g.fillRect(x + dx - 1.5, y + dy - 1.5, 4, 3);
  }
  function drawFish(g, n, nt, time) {
    const x = n.x * T + T / 2, y = n.y * T + T / 2;
    if (n.charges <= 0) return;
    g.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) {
      const p = (time * 0.6 + k * 0.5 + n.id * 0.37) % 1;
      g.strokeStyle = `rgba(235,250,255,${0.7 * (1 - p)})`;
      g.beginPath(); g.ellipse(x, y, 3 + p * 8, 2 + p * 4, 0, 0, Math.PI * 2); g.stroke();
    }
    const j = Math.sin(time * 3 + n.id) * 3;
    ell(g, x + j, y, 3.5, 1.8, nt.color);
  }

  function drawStation(g, s, time) {
    const x = s.x * T + T / 2, y = s.y * T + T / 2;
    shadow(g, x, y, 11);
    if (s.id === 'stash') {
      g.fillStyle = '#7a4f2a'; g.fillRect(x - 10, y - 5, 20, 14);
      g.fillStyle = '#93602f'; g.fillRect(x - 10, y - 9, 20, 6);
      g.fillStyle = '#e2b644'; g.fillRect(x - 10, y - 4, 20, 2); g.fillRect(x - 2, y - 5, 4, 5);
    } else if (s.id === 'forge') {
      g.fillStyle = '#4a4744'; g.fillRect(x - 10, y - 8, 20, 17);
      g.fillStyle = '#35322f'; g.fillRect(x - 6, y - 16, 8, 9);
      const glow = 0.7 + Math.sin(time * 6) * 0.2;
      g.fillStyle = `rgba(255,${130 + glow * 60},40,${glow})`; g.fillRect(x - 6, y - 2, 12, 8);
      ell(g, x - 2, y - 19 - (time * 8 % 8), 3, 3, 'rgba(200,200,200,.25)');
    } else {
      g.fillStyle = '#5b3d24'; g.fillRect(x - 9, y + 3, 18, 4);
      g.save(); g.translate(x, y + 5); g.rotate(0.5); g.fillRect(-9, -2, 18, 4); g.restore();
      const f = Math.sin(time * 11) * 2;
      g.fillStyle = '#ff7a2a'; g.beginPath(); g.moveTo(x - 6, y + 4); g.quadraticCurveTo(x - 4 + f, y - 8, x, y - 13 - f); g.quadraticCurveTo(x + 5 + f, y - 6, x + 6, y + 4); g.fill();
      g.fillStyle = '#ffd659'; g.beginPath(); g.moveTo(x - 3, y + 4); g.quadraticCurveTo(x - f, y - 3, x, y - 6); g.quadraticCurveTo(x + 3, y - 2, x + 3, y + 4); g.fill();
    }
  }

  function drawMob(g, m, mt, time, flash) {
    const x = m.x * T + T / 2, bob = Math.sin(time * 3 + m.id * 1.7), y = m.y * T + T / 2;
    const c = flash ? '#ffffff' : mt.color;
    const eye = (ex, ey, col) => { g.fillStyle = col || '#1b1b1b'; g.fillRect(ex - 1, ey - 1, 2, 3); };
    if (m.type === 'slime') {
      shadow(g, x, y, 8);
      const sq = 1 + bob * 0.08;
      g.fillStyle = c; g.beginPath(); g.ellipse(x, y + 6, 8 * sq, 9 / sq, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 5, y - 1, 2, 2);
      eye(x - 3, y + 2); eye(x + 3, y + 2);
    } else if (m.type === 'thornrat') {
      shadow(g, x, y, 9);
      g.strokeStyle = '#d9a7a0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 8, y + 4); g.quadraticCurveTo(x - 14, y + 2 + bob * 2, x - 13, y - 3); g.stroke();
      ell(g, x, y + 3, 8, 5, c); ell(g, x + 7, y + 2, 4, 3.5, c);
      g.fillStyle = '#e9dcb8'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 4 - 2, y - 1); g.lineTo(x + k * 4, y - 7); g.lineTo(x + k * 4 + 2, y - 1); g.fill(); }
      eye(x + 8, y + 1);
    } else if (m.type === 'duskwolf') {
      shadow(g, x, y, 11);
      g.fillStyle = c; g.fillRect(x - 9, y - 2, 16, 8); g.fillRect(x - 8, y + 5, 3, 5); g.fillRect(x + 3, y + 5, 3, 5);
      g.fillRect(x + 4, y - 8 + bob * 0.5, 8, 8);
      g.beginPath(); g.moveTo(x + 5, y - 8); g.lineTo(x + 6, y - 12); g.lineTo(x + 8, y - 8); g.moveTo(x + 9, y - 8); g.lineTo(x + 11, y - 12); g.lineTo(x + 12, y - 8); g.fill();
      g.beginPath(); g.moveTo(x - 9, y - 1); g.lineTo(x - 14, y - 5 + bob); g.lineTo(x - 9, y + 3); g.fill();
      eye(x + 9, y - 5, '#ffe36e');
    } else if (m.type === 'marauder') {
      shadow(g, x, y, 8);
      g.fillStyle = '#3a2b2b'; g.fillRect(x - 4, y + 4, 3, 6); g.fillRect(x + 1, y + 4, 3, 6);
      g.fillStyle = c; g.fillRect(x - 6, y - 5, 12, 10);
      ell(g, x, y - 9 + bob * 0.4, 5, 5, '#d8a57c');
      g.fillStyle = c; g.beginPath(); g.arc(x, y - 10 + bob * 0.4, 5.5, Math.PI, 0); g.fill();
      g.fillStyle = '#c9ccd2'; g.fillRect(x + 7, y - 9, 2, 13);
      eye(x - 2, y - 9); eye(x + 2, y - 9);
    } else if (m.type === 'cragback') {
      shadow(g, x, y, 13);
      g.fillStyle = c; g.fillRect(x - 10, y - 9, 20, 17); g.fillRect(x - 14, y - 5 + bob, 5, 12); g.fillRect(x + 9, y - 5 - bob, 5, 12);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x - 10, y + 3, 20, 5);
      g.fillStyle = '#5c8f4e'; g.fillRect(x - 9, y - 11, 8, 3);
      eye(x - 4, y - 3, '#7de3ff'); eye(x + 4, y - 3, '#7de3ff');
    } else {
      // the wyrm is drawn larger than its tile
      shadow(g, x, y + 4, 20);
      const flap = Math.sin(time * 4) * 5;
      g.fillStyle = flash ? '#fff' : '#9b2f1b';
      g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x - 24, y - 16 - flap); g.lineTo(x - 16, y + 4); g.fill();
      g.beginPath(); g.moveTo(x + 4, y - 2); g.lineTo(x + 24, y - 16 - flap); g.lineTo(x + 16, y + 4); g.fill();
      ell(g, x, y + 3, 13, 9, c);
      ell(g, x, y + 5, 8, 5, '#f3b56a');
      g.fillStyle = c; g.fillRect(x - 4, y - 14 + bob, 8, 12);
      ell(g, x, y - 16 + bob, 7, 6, c);
      g.fillStyle = '#f3e3b0'; g.beginPath(); g.moveTo(x - 5, y - 20 + bob); g.lineTo(x - 7, y - 26 + bob); g.lineTo(x - 2, y - 21 + bob); g.moveTo(x + 5, y - 20 + bob); g.lineTo(x + 7, y - 26 + bob); g.lineTo(x + 2, y - 21 + bob); g.fill();
      eye(x - 3, y - 17 + bob, '#fff27a'); eye(x + 3, y - 17 + bob, '#fff27a');
    }
    if (m.hp < mt.hp) bar(g, x, y - (mt.boss ? 32 : 17), mt.boss ? 40 : 22, m.hp / mt.hp, '#e0605a');
  }

  function bar(g, x, y, w, frac, color) {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    g.fillStyle = color; g.fillRect(x - w / 2, y, Math.max(0, w * frac), 3);
  }

  function drawHero(g, S, rt, time) {
    const h = S.hero, x = h.x * T + T / 2, y = h.y * T + T / 2;
    if (rt.act === 'ko') {
      shadow(g, x, y, 10);
      g.fillStyle = TIER_COLOR[S.gear.armor]; g.fillRect(x - 9, y + 2, 14, 6);
      ell(g, x + 8, y + 5, 4, 4, '#e8b98d');
      g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif';
      g.fillText('z', x + 10, y - 4 - (time * 6 % 6)); g.fillText('Z', x + 15, y - 10 - (time * 6 % 6));
      return;
    }
    const walking = rt.act === 'walk';
    const step = walking ? Math.sin(time * 14) * 3 : 0;
    const hop = walking ? Math.abs(Math.sin(time * 14)) * 1.5 : 0;
    shadow(g, x, y, 8);
    g.save();
    g.translate(x, y - hop);
    g.scale(h.face, 1);
    g.fillStyle = '#3b3550';
    g.fillRect(-4, 4 + Math.max(0, step) * 0.3, 3, 6 - Math.max(0, step) * 0.3);
    g.fillRect(1, 4 + Math.max(0, -step) * 0.3, 3, 6 - Math.max(0, -step) * 0.3);
    g.fillStyle = S.gear.armor ? TIER_COLOR[S.gear.armor] : '#4c6fb5';
    g.fillRect(-6, -5, 12, 10);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-6, 2, 12, 3);
    ell(g, 0, -9, 5, 5, '#e8b98d');
    g.fillStyle = '#5a3a22'; g.beginPath(); g.arc(0, -10, 5.2, Math.PI, 0); g.fill();
    g.fillStyle = '#1b1b1b'; g.fillRect(2, -9, 2, 2);

    // the tool in hand depends on what the hero is doing
    const swing = Math.sin(time * 9);
    let tool = null;
    const skill = rt.act === 'gather' && rt.target ? NODES[rt.target.type].skill : null;
    if (rt.act === 'fight') tool = 'sword';
    else if (skill === 'woodcutting') tool = 'axe';
    else if (skill === 'mining') tool = 'pick';
    else if (skill === 'fishing') tool = 'rod';
    else if (rt.act === 'craft') tool = 'hammer';
    if (tool === 'rod') {
      g.strokeStyle = '#8a6f4d'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(5, 0); g.lineTo(16, -12); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(16, -12); g.lineTo(20, 4 + swing); g.stroke();
    } else if (tool) {
      g.translate(6, -1);
      g.rotate(-0.9 + (swing + 1) * 0.75);
      g.fillStyle = '#8a6f4d'; g.fillRect(-1, -12, 2, 13);
      if (tool === 'sword') { g.fillStyle = TIER_COLOR[S.gear.weapon] || '#8a6f4d'; g.fillRect(-1.5, -15, 3, 12); g.fillStyle = '#e2b644'; g.fillRect(-4, -4, 8, 2); }
      else if (tool === 'axe') { g.fillStyle = TIER_COLOR[S.gear.axe] === '#8a6f4d' ? '#9a9a9a' : TIER_COLOR[S.gear.axe]; g.fillRect(0, -13, 6, 6); }
      else if (tool === 'pick') { g.fillStyle = TIER_COLOR[S.gear.pick] === '#8a6f4d' ? '#9a9a9a' : TIER_COLOR[S.gear.pick]; g.fillRect(-6, -13, 12, 3); }
      else { g.fillStyle = '#777'; g.fillRect(-4, -14, 8, 5); }
    }
    g.restore();
    const hpMax = Sim.maxHp(S);
    if (h.hp < hpMax - 0.5) bar(g, x, y - 22, 24, h.hp / hpMax, '#6fd36f');
  }

  Renderer.prototype.draw = function (S, dt) {
    const g = this.ctx, W = this.W, rt = W.rt;
    this.time += dt;
    const time = this.time;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.ground, 0, 0);

    // water shimmer
    g.fillStyle = 'rgba(255,255,255,.12)';
    for (let y = 0; y < W.h; y++)
      for (let x = 0; x < W.w; x++) {
        if (W.terrain[y * W.w + x] !== TR.WATER) continue;
        const p = (hash(x, y) + time * 0.25) % 1;
        if (p < 0.35) g.fillRect(x * T + 4 + p * 30, y * T + 6 + hash(y, x) * 10, 8, 1.5);
      }

    // planned route
    if (rt.path.length) {
      g.fillStyle = 'rgba(255,255,255,.4)';
      for (let i = 0; i < rt.path.length; i += 1) g.fillRect(rt.path[i][0] * T + T / 2 - 1.5, rt.path[i][1] * T + T / 2 - 1.5, 3, 3);
    }
    // current target ring
    const tgt = rt.target || (rt.path.length ? rt.pathRef : null);
    if (tgt) {
      g.strokeStyle = `rgba(255,224,138,${0.55 + Math.sin(time * 5) * 0.25})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(tgt.x * T + T / 2, tgt.y * T + T * 0.8, 12, 5, 0, 0, Math.PI * 2); g.stroke();
    }
    if (this.hover) {
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5;
      g.strokeRect(this.hover.x * T + 1, this.hover.y * T + 1, T - 2, T - 2);
    }

    // everything standing on the map, back to front
    const things = [];
    for (const n of W.nodes) things.push({ y: n.y, k: 'n', o: n });
    for (const m of W.mobs) if (m.hp > 0) things.push({ y: m.y + 0.01, k: 'm', o: m });
    for (const id in W.stations) things.push({ y: W.stations[id].y, k: 's', o: W.stations[id] });
    things.push({ y: S.hero.y + 0.02, k: 'h' });
    things.sort((a, b) => a.y - b.y);
    for (const [key, left] of this.flash) { if (left - dt <= 0) this.flash.delete(key); else this.flash.set(key, left - dt); }
    for (const t of things) {
      if (t.k === 'n') {
        const nt = NODES[t.o.type];
        if (nt.kind === 'tree') drawTree(g, t.o, nt); else if (nt.kind === 'rock') drawRock(g, t.o, nt); else drawFish(g, t.o, nt, time);
      } else if (t.k === 'm') drawMob(g, t.o, MOBS[t.o.type], time, this.flash.has(t.o.x + ',' + t.o.y));
      else if (t.k === 's') drawStation(g, t.o, time);
      else drawHero(g, S, rt, time);
    }

    // action progress under the hero
    if ((rt.act === 'gather' || rt.act === 'craft') && rt.target) {
      const total = rt.act === 'gather' ? Sim.gatherTime(S, NODES[rt.target.type]) : root.GameData.RECIPES[S.goal.recipe].time;
      bar(g, S.hero.x * T + T / 2, S.hero.y * T + T + 3, 24, Math.min(1, rt.actT / total), '#ffe08a');
    }

    // floating numbers
    g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center';
    this.floats = this.floats.filter((f) => (f.age += dt) < 1.2);
    for (const f of this.floats) {
      const a = 1 - f.age / 1.2, fx = f.x * T + T / 2, fy = f.y * T + T / 2 - f.age * 22;
      g.globalAlpha = a;
      g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3; g.strokeText(f.text, fx, fy);
      g.fillStyle = f.color; g.fillText(f.text, fx, fy);
    }
    g.globalAlpha = 1;
  };

  // Which clickable thing (if any) is on this tile?
  Renderer.prototype.pick = function (clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), W = this.W;
    const x = Math.floor(((clientX - r.left) / r.width) * W.w), y = Math.floor(((clientY - r.top) / r.height) * W.h);
    for (const m of W.mobs) if (m.hp > 0 && Math.abs(m.x - x) <= (MOBS[m.type].boss ? 1 : 0) && m.y - y >= 0 && m.y - y <= (MOBS[m.type].boss ? 1 : 0)) return { kind: 'mob', ref: m, x: m.x, y: m.y };
    for (const n of W.nodes) if (n.x === x && n.y === y) return { kind: 'node', ref: n, x, y };
    for (const id in W.stations) if (W.stations[id].x === x && W.stations[id].y === y) return { kind: 'station', ref: W.stations[id], x, y };
    return null;
  };

  root.Renderer = Renderer;
})(window);
