// Run with: node --test idle-game/test/sim.test.js
const test = require('node:test');
const assert = require('node:assert');
const D = require('../data.js');
const Sim = require('../sim.js');

test('every node, monster and station is reachable from town', () => {
  const W = Sim.buildWorld(1);
  const targets = [...W.nodes, ...W.mobs, ...Object.values(W.stations)];
  for (const type in D.NODES) assert.ok(W.nodes.some((n) => n.type === type), `no ${type} placed`);
  for (const type in D.MOBS) assert.ok(W.mobs.some((m) => m.type === type), `no ${type} placed`);
  for (const t of targets) {
    const res = Sim.bfs(W, Sim.HOME.x, Sim.HOME.y, Sim.standTiles(W, [t]));
    assert.ok(res, `unreachable: ${t.type || t.id} at ${t.x},${t.y}`);
  }
});

test('autopilot makes steady progress on its own', () => {
  const W = Sim.buildWorld(7);
  const S = Sim.newState();
  Sim.simulate(S, W, 3 * 3600);
  for (const k in D.SKILLS) {
    assert.ok(Number.isFinite(S.xp[k]), `${k} xp is not finite`);
    assert.ok(Sim.lvl(S, k) >= 7, `${k} only reached level ${Sim.lvl(S, k)}`);
  }
  assert.ok(S.gear.weapon >= 1 && S.gear.pick >= 1 && S.gear.axe >= 1 && S.gear.armor >= 1, 'gear was not upgraded');
  assert.ok(S.stats.kills > 20, 'hero barely fought');
  assert.ok(S.hero.hp > 0 && S.hero.hp <= Sim.maxHp(S));
  assert.ok(Sim.count(S.inv) <= Sim.packCap(S));
  for (const bag of [S.inv, S.stash, S.pouch]) for (const k in bag) assert.ok(bag[k] > 0 && D.ITEMS[k], `bad stack ${k}`);
});

test('each autopilot focus keeps the hero busy', () => {
  for (const focus in D.FOCUSES) {
    const W = Sim.buildWorld(3);
    const S = Sim.newState();
    S.focus = focus;
    Sim.simulate(S, W, 3600);
    const total = Object.values(S.xp).reduce((a, b) => a + b, 0);
    assert.ok(total > 3000, `${focus}: only ${total} xp in an hour`);
  }
});

test('manual goals run without the autopilot and saves round-trip', () => {
  const W = Sim.buildWorld(5);
  let S = Sim.newState();
  Sim.manualGoal(S, W, { kind: 'gather', node: 'ashwood' });
  Sim.simulate(S, W, 600);
  assert.strictEqual(S.auto, false);
  assert.ok(Sim.owned(S, 'ashwood_log') > 30);
  assert.strictEqual(S.xp.mining, 0);
  const xp = S.xp.woodcutting;
  S = Sim.hydrate(JSON.parse(JSON.stringify(S)));
  assert.strictEqual(S.xp.woodcutting, xp);
  assert.strictEqual(S.goal.node, 'ashwood');
  const W2 = Sim.buildWorld(5);
  Sim.simulate(S, W2, 60);
  assert.ok(S.xp.woodcutting > xp);
});
