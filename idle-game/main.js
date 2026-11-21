// Emberwake Idle — browser glue: game loop, saving, offline progress and the side panels.
(function () {
  const D = window.GameData, Sim = window.Sim;
  const { SKILLS, ITEMS, NODES, RECIPES, MOBS, UPGRADES, FOCUSES, METALS, GEAR_SLOTS } = D;
  const SAVE_KEY = 'emberwake-idle-save-v1';
  const OFFLINE_CAP = 12 * 3600;
  const STEP = 0.1;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');

  function load() {
    try { return Sim.hydrate(JSON.parse(localStorage.getItem(SAVE_KEY))); }
    catch (e) { return Sim.newState(); }
  }
  function save() {
    S.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: play on without saving */ }
  }

  let S = load();
  const W = Sim.buildWorld();
  const renderer = new window.Renderer($('world'), W);
  let speed = 1;

  // ------------------------------------------------------------ log + offline summary

  function addLog(text, tone) {
    const li = document.createElement('li');
    li.textContent = text;
    if (tone) li.className = tone;
    const ul = $('log');
    ul.prepend(li);
    while (ul.children.length > 60) ul.lastChild.remove();
  }

  function duration(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m` : `${Math.floor(sec)}s`;
  }

  function catchUp(seconds, announce) {
    const capped = Math.min(seconds, OFFLINE_CAP);
    if (!S.auto && !S.goal) return;
    const sum = Sim.simulate(S, W, capped);
    if (!announce) return;
    const lines = [];
    for (const k in sum.levels) lines.push(`${SKILLS[k].name} ${sum.levels[k][0]} → ${sum.levels[k][1]}`);
    for (const name of sum.gear) lines.push(`Forged: ${name}`);
    if (sum.kills) lines.push(`${fmt(sum.kills)} monsters defeated`);
    if (sum.gold) lines.push(`${sum.gold > 0 ? '+' : ''}${fmt(sum.gold)} gold`);
    if (!lines.length) lines.push('Steady work, nothing new to report.');
    $('awayBody').innerHTML = `<p>Your hero kept going for <b>${duration(capped)}</b>${seconds > capped ? ' (the offline limit)' : ''}.</p><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    if ($('away').showModal) $('away').showModal();
  }

  // ------------------------------------------------------------ static panels

  for (const id in FOCUSES) $('focus').add(new Option(FOCUSES[id].name, id));

  const skillEls = {};
  for (const k in SKILLS) {
    const row = document.createElement('div');
    row.className = 'skill';
    row.innerHTML = `<span class="name">${SKILLS[k].name}</span><div class="track"><span style="background:${SKILLS[k].color}"></span></div><span class="lv"></span>`;
    $('skills').append(row);
    skillEls[k] = { row, fill: row.querySelector('.track span'), lv: row.querySelector('.lv') };
  }

  const recipeEls = {};
  for (const id in RECIPES) {
    const r = RECIPES[id];
    const b = document.createElement('button');
    b.className = 'row';
    const needs = Object.keys(r.in).map((i) => `${r.in[i]} ${ITEMS[i].name}`).join(', ');
    b.innerHTML = `<span class="t">${r.name}<small>${SKILLS[r.skill].name} ${r.level} · ${needs}</small></span>`;
    b.addEventListener('click', () => {
      Sim.manualGoal(S, W, { kind: 'craft', recipe: id });
      addLog(`You take over: ${r.verb} ${r.name}.`);
      refresh();
    });
    $('recipes').append(b);
    recipeEls[id] = b;
  }

  const upgradeEls = {};
  for (const id in UPGRADES) {
    const b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = `<span class="t"><span class="n"></span><small>${UPGRADES[id].desc}</small></span><span class="c"></span>`;
    b.addEventListener('click', () => { Sim.buyUpgrade(S, W, id); refresh(); });
    $('upgrades').append(b);
    upgradeEls[id] = { b, n: b.querySelector('.n'), c: b.querySelector('.c') };
  }

  const chip = (color, label, n) => `<span class="chip"><i style="background:${color}"></i>${label}${n === undefined ? '' : ` <b>${fmt(n)}</b>`}</span>`;

  function refresh() {
    $('gold').textContent = fmt(S.gold);
    $('auto').setAttribute('aria-pressed', String(S.auto));
    $('focus').value = S.focus;
    $('focus').disabled = !S.auto;
    $('thought').textContent = Sim.describeGoal(S, W);

    const hpMax = Sim.maxHp(S);
    $('hpbar').style.width = `${(Math.max(0, S.hero.hp) / hpMax) * 100}%`;
    $('hptext').textContent = `${Math.max(0, Math.ceil(S.hero.hp))} / ${hpMax} HP`;

    $('gear').innerHTML = Object.keys(GEAR_SLOTS).map((slot) => {
      const tier = S.gear[slot];
      return tier ? chip(METALS[tier - 1].color, `${METALS[tier - 1].name} ${GEAR_SLOTS[slot].name}`) : chip('#5b566a', `No ${GEAR_SLOTS[slot].name.toLowerCase()}`);
    }).join('');
    const meals = Sim.count(S.pouch);
    $('carry').innerHTML = chip('#c9a36b', 'Pack', Sim.count(S.inv)) + `<span class="empty">/ ${Sim.packCap(S)}</span>` + chip('#e39a4f', 'Meals', meals) + `<span class="empty">/ ${Sim.pouchCap(S)}</span>`;

    const g = S.goal;
    const activeSkill = !g ? null : g.kind === 'gather' ? NODES[g.node].skill : g.kind === 'fight' ? 'combat' : RECIPES[g.recipe].skill;
    for (const k in SKILLS) {
      const L = Sim.lvl(S, k), el = skillEls[k];
      const frac = L >= Sim.MAX_LEVEL ? 1 : (S.xp[k] - Sim.xpFor(L)) / (Sim.xpFor(L + 1) - Sim.xpFor(L));
      el.lv.textContent = L;
      el.fill.style.width = `${frac * 100}%`;
      el.row.classList.toggle('active', k === activeSkill);
      el.row.title = L >= Sim.MAX_LEVEL ? 'Mastered' : `${fmt(S.xp[k])} / ${fmt(Sim.xpFor(L + 1))} xp`;
    }

    for (const id in RECIPES) {
      const r = RECIPES[id], el = recipeEls[id];
      const owned = r.gear && S.gear[r.gear.slot] >= r.gear.tier;
      el.disabled = !Sim.canCraft(S, r);
      el.classList.toggle('owned', !!owned);
      // keep the list short: hide gear you've outgrown and recipes far beyond you
      el.hidden = !!owned || r.level > Sim.lvl(S, r.skill) + 12;
    }

    const items = Object.keys(S.stash);
    $('stash').innerHTML = items.length ? items.map((i) => chip(ITEMS[i].color, ITEMS[i].name, S.stash[i])).join('') : '<span class="empty">Empty — gathered goods are banked here.</span>';

    for (const id in UPGRADES) {
      const n = S.upgrades[id], u = UPGRADES[id], el = upgradeEls[id];
      const maxed = n >= u.max, cost = Sim.upgradeCost(id, n);
      el.n.textContent = `${u.name} ${n}/${u.max}`;
      el.c.textContent = maxed ? 'Max' : `${fmt(cost)}g`;
      el.b.disabled = maxed || S.gold < cost;
    }
  }

  // ------------------------------------------------------------ input

  $('auto').addEventListener('click', () => {
    S.auto = !S.auto;
    if (S.auto) { S.goal = null; W.rt.pathKey = null; addLog('Autopilot on — the hero decides what to do next.'); }
    else addLog('Autopilot off — the hero keeps doing the current task until you pick another.');
    refresh();
  });
  $('focus').addEventListener('change', (e) => {
    S.focus = e.target.value; S.goal = null; W.rt.pathKey = null;
    addLog(`Autopilot focus: ${FOCUSES[S.focus].name}.`);
    refresh();
  });
  $('speed').addEventListener('click', (e) => {
    if (e.target.dataset.speed === undefined) return;
    speed = Number(e.target.dataset.speed);
    for (const b of $('speed').children) b.classList.toggle('on', b === e.target);
  });
  $('sell').addEventListener('click', () => { if (!Sim.sellSurplus(S, W)) addLog('Nothing to spare — a working reserve of each item is kept.'); refresh(); });
  $('reset').addEventListener('click', () => {
    if (!confirm('Start over? This erases your saved hero.')) return;
    S = Sim.newState();
    W.rt.path = []; W.rt.pathKey = null; W.rt.act = 'idle'; W.rt.target = null;
    $('log').textContent = '';
    save(); refresh();
  });

  function describe(hit) {
    if (hit.kind === 'node') {
      const nt = NODES[hit.ref.type], ok = Sim.lvl(S, nt.skill) >= nt.level;
      return `<b>${nt.name}</b> · <span class="${ok ? '' : 'no'}">${SKILLS[nt.skill].name} ${nt.level}</span>${hit.ref.charges <= 0 ? ' · depleted' : ''}`;
    }
    if (hit.kind === 'mob') {
      const mt = MOBS[hit.ref.type], danger = Sim.threat(S, mt);
      const risk = danger <= 0.6 ? 'safe' : danger <= 1.5 ? 'risky' : 'deadly';
      return `<b>${mt.name}</b> · level ${mt.level} · <span class="${risk === 'safe' ? '' : 'no'}">${risk}</span>`;
    }
    return `<b>${hit.ref.name}</b>${hit.ref.id === 'stash' ? ' · banks your pack' : ' · use the Workshop list'}`;
  }
  const canvas = $('world'), tip = $('tip');
  canvas.addEventListener('mousemove', (e) => {
    const hit = renderer.pick(e.clientX, e.clientY);
    renderer.hover = hit;
    tip.hidden = !hit;
    if (!hit) return;
    const r = canvas.getBoundingClientRect();
    tip.innerHTML = describe(hit);
    tip.style.left = `${Math.min(e.clientX - r.left, r.width - 190)}px`;
    tip.style.top = `${e.clientY - r.top}px`;
  });
  canvas.addEventListener('mouseleave', () => { renderer.hover = null; tip.hidden = true; });
  canvas.addEventListener('click', (e) => {
    const hit = renderer.pick(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === 'node') {
      const nt = NODES[hit.ref.type];
      if (Sim.lvl(S, nt.skill) < nt.level) { addLog(`You need ${SKILLS[nt.skill].name} ${nt.level} for a ${nt.name}.`, 'bad'); return; }
      Sim.manualGoal(S, W, { kind: 'gather', node: hit.ref.type });
      addLog(`You take over: gathering at ${nt.name}s.`);
    } else if (hit.kind === 'mob') {
      Sim.manualGoal(S, W, { kind: 'fight', mob: hit.ref.type });
      addLog(`You take over: hunting ${MOBS[hit.ref.type].name}s.`);
    } else {
      addLog(hit.ref.id === 'stash' ? 'The stash banks your pack automatically whenever it fills up.' : `Pick something from the Workshop list to use the ${hit.ref.name.toLowerCase()}.`);
    }
    refresh();
  });

  // ------------------------------------------------------------ loop

  let last = performance.now(), wall = Date.now(), acc = 0, uiT = 0, saveT = 0;

  function frame(now) {
    const real = Math.min(0.25, (now - last) / 1000);
    last = now;
    // If the tab was asleep, fast-forward the missed time instead of crawling through it.
    const gap = (Date.now() - wall) / 1000;
    wall = Date.now();
    if (gap > 2 && speed > 0) catchUp(gap * speed, gap > 60);

    acc += real * speed;
    let steps = 0;
    while (acc >= STEP && steps++ < 40) { Sim.step(S, W, STEP); acc -= STEP; }
    if (steps >= 40) acc = 0;

    for (const ev of W.events) if (ev.type === 'log') addLog(ev.text, ev.tone);
    renderer.consume(W.events);
    W.events.length = 0;
    renderer.draw(S, real * Math.max(speed, speed ? 1 : 0));

    if ((uiT += real) > 0.2) { uiT = 0; refresh(); }
    if ((saveT += real) > 10) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  if (S.savedAt) {
    const away = (Date.now() - S.savedAt) / 1000;
    if (away > 30) catchUp(away, true);
  } else addLog('A new hero arrives in Emberwake. The autopilot is on — sit back, or click the map to take over.');
  refresh();
  requestAnimationFrame(frame);

  window.__game = { get state() { return S; }, world: W, save }; // handy for debugging in the console
})();
