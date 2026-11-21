// Emberwake Idle — static game data (skills, items, nodes, recipes, monsters).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SKILLS = {
    woodcutting: { name: 'Woodcutting', color: '#7fb069' },
    mining: { name: 'Mining', color: '#c9a36b' },
    fishing: { name: 'Fishing', color: '#5fb3d9' },
    cooking: { name: 'Cooking', color: '#e39a4f' },
    smithing: { name: 'Smithing', color: '#b9bec9' },
    combat: { name: 'Combat', color: '#e0605a' },
  };

  const METALS = [
    { id: 'copper', name: 'Copper', level: 1, color: '#c87533', xp: 10, time: 2.6, value: 2 },
    { id: 'iron', name: 'Iron', level: 10, color: '#aeb6c0', xp: 26, time: 3.6, value: 6 },
    { id: 'skysteel', name: 'Skysteel', level: 25, color: '#6ec5ff', xp: 58, time: 4.8, value: 16 },
    { id: 'emberite', name: 'Emberite', level: 40, color: '#ff6a3d', xp: 110, time: 6, value: 40 },
  ];
  const WOODS = [
    { id: 'ashwood', name: 'Ashwood', level: 1, color: '#7fb069', xp: 10, time: 2.4, value: 2 },
    { id: 'ironbark', name: 'Ironbark', level: 12, color: '#3f7256', xp: 26, time: 3.4, value: 6 },
    { id: 'moonwillow', name: 'Moonwillow', level: 28, color: '#9ad1d4', xp: 60, time: 4.6, value: 15 },
  ];
  const FISH = [
    { id: 'minnow', name: 'Minnow', level: 1, color: '#bfe3f2', xp: 10, time: 2.8, value: 2, heal: 10 },
    { id: 'riverfin', name: 'Riverfin', level: 10, color: '#7fd1a8', xp: 26, time: 3.6, value: 5, heal: 22 },
    { id: 'glowfin', name: 'Glowfin', level: 25, color: '#f2e27a', xp: 58, time: 4.8, value: 12, heal: 45 },
  ];
  const GEAR_SLOTS = {
    weapon: { name: 'Sword', bars: 3, logs: 1, offset: 2 },
    pick: { name: 'Pickaxe', bars: 2, logs: 1, offset: 0 },
    axe: { name: 'Hatchet', bars: 2, logs: 1, offset: 1 },
    armor: { name: 'Armor', bars: 5, logs: 0, offset: 4 },
  };

  const ITEMS = {};
  const NODES = {};
  const RECIPES = {};

  for (const w of WOODS) {
    ITEMS[w.id + '_log'] = { name: w.name + ' Log', value: w.value, color: w.color };
    NODES[w.id] = {
      name: w.name + ' Tree', kind: 'tree', skill: 'woodcutting', level: w.level,
      item: w.id + '_log', xp: w.xp, time: w.time, color: w.color,
    };
  }
  for (const m of METALS) {
    ITEMS[m.id + '_ore'] = { name: m.name + ' Ore', value: m.value, color: m.color };
    ITEMS[m.id + '_bar'] = { name: m.name + ' Bar', value: m.value * 3, color: m.color };
    NODES[m.id + '_rock'] = {
      name: m.name + ' Vein', kind: 'rock', skill: 'mining', level: m.level,
      item: m.id + '_ore', xp: m.xp, time: m.time, color: m.color,
    };
  }
  for (const f of FISH) {
    ITEMS['raw_' + f.id] = { name: 'Raw ' + f.name, value: f.value, color: f.color };
    ITEMS['cooked_' + f.id] = { name: 'Grilled ' + f.name, value: f.value * 2, color: '#e39a4f', heal: f.heal };
    NODES[f.id + '_spot'] = {
      name: f.name + ' Shoal', kind: 'fish', skill: 'fishing', level: f.level,
      item: 'raw_' + f.id, xp: f.xp, time: f.time, color: f.color,
    };
    RECIPES['cook_' + f.id] = {
      name: 'Grilled ' + f.name, verb: 'cooking', skill: 'cooking', station: 'campfire',
      level: f.level, in: { ['raw_' + f.id]: 1 }, out: { ['cooked_' + f.id]: 1 },
      xp: Math.round(f.xp * 0.8), time: 1.6,
    };
  }

  // Fuel log needed per bar, and the handle wood used for gear, by metal tier.
  const FUEL = [null, 'ashwood_log', 'ironbark_log', 'moonwillow_log'];
  const HANDLE = ['ashwood_log', 'ashwood_log', 'ironbark_log', 'moonwillow_log'];
  METALS.forEach((m, i) => {
    const inp = { [m.id + '_ore']: 2 };
    if (FUEL[i]) inp[FUEL[i]] = 1;
    RECIPES[m.id + '_bar'] = {
      name: m.name + ' Bar', verb: 'smelting', skill: 'smithing', station: 'forge',
      level: m.level, in: inp, out: { [m.id + '_bar']: 1 }, xp: Math.round(m.xp * 1.2), time: 2.2,
    };
    for (const slot in GEAR_SLOTS) {
      const g = GEAR_SLOTS[slot];
      const gin = { [m.id + '_bar']: g.bars };
      if (g.logs) gin[HANDLE[i]] = g.logs;
      RECIPES[m.id + '_' + slot] = {
        name: m.name + ' ' + g.name, verb: 'forging', skill: 'smithing', station: 'forge',
        level: m.level + g.offset, in: gin, out: {}, gear: { slot, tier: i + 1 },
        xp: Math.round(m.xp * g.bars * 1.5), time: 3.5,
      };
    }
  });

  // Where each item comes from (used by the autopilot planner).
  const SOURCES = {};
  for (const id in NODES) SOURCES[NODES[id].item] = { node: id };
  for (const id in RECIPES) for (const out in RECIPES[id].out) SOURCES[out] = { recipe: id };

  const MOBS = {
    slime: { name: 'Mossling', level: 1, hp: 10, atk: 2, xp: 15, gold: [2, 4], respawn: 6, color: '#8fd36b' },
    thornrat: { name: 'Thornrat', level: 5, hp: 26, atk: 4, xp: 40, gold: [5, 9], respawn: 7, color: '#a5774d' },
    duskwolf: { name: 'Duskwolf', level: 12, hp: 60, atk: 9, xp: 80, gold: [12, 20], respawn: 8, color: '#7d7aa8' },
    marauder: { name: 'Road Marauder', level: 20, hp: 110, atk: 15, xp: 150, gold: [25, 40], respawn: 9, color: '#b5463f' },
    cragback: { name: 'Cragback', level: 30, hp: 200, atk: 24, xp: 280, gold: [50, 80], respawn: 10, color: '#8c8f96' },
    wyrm: { name: 'Cinder Wyrm', level: 45, hp: 600, atk: 34, xp: 900, gold: [250, 400], respawn: 30, color: '#e8552e', boss: true },
  };

  const UPGRADES = {
    pack: { name: 'Bigger Pack', desc: '+6 carry capacity', base: 60, growth: 2.2, max: 6 },
    boots: { name: 'Trail Boots', desc: '+8% walking speed', base: 100, growth: 2.4, max: 5 },
    pouch: { name: 'Ration Pouch', desc: '+3 meals carried', base: 80, growth: 2.2, max: 5 },
    whetstone: { name: 'Whetstone', desc: '+5% damage dealt', base: 150, growth: 2, max: 10 },
    charm: { name: 'Scholar\'s Charm', desc: '+4% experience gained', base: 200, growth: 2.1, max: 10 },
  };

  const FOCUSES = {
    balanced: { name: 'Balanced', skills: Object.keys(SKILLS) },
    combat: { name: 'Combat', skills: ['combat'] },
    gathering: { name: 'Gathering', skills: ['woodcutting', 'mining', 'fishing'] },
    crafting: { name: 'Crafting', skills: ['smithing', 'cooking'] },
  };

  return { SKILLS, METALS, WOODS, FISH, GEAR_SLOTS, ITEMS, NODES, RECIPES, SOURCES, MOBS, UPGRADES, FOCUSES };
});
