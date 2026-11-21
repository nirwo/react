# Emberwake Idle

An original graphical idle RPG that plays itself. A hero wanders a small canvas-drawn
world chopping, mining, fishing, cooking, smithing and fighting; an autopilot decides
what to do next and tells you why.

## Play

Open `idle-game/index.html` in a browser — no build step, no dependencies, no server.

- **Autopilot** (on by default) keeps the hero fed, forges the next gear upgrade it can
  reach, buys upgrades, sells surplus, and otherwise trains according to the chosen
  **Focus** (Balanced, Combat, Gathering, Crafting).
- **Take over** by clicking a tree, vein, shoal or monster on the map, or a recipe in the
  Workshop. The hero repeats that task until you pick another or switch Autopilot back on.
- **Offline progress**: the game saves to `localStorage` and fast-forwards up to 12 hours
  of missed time when you come back.

## Code

| File | Purpose |
| --- | --- |
| `data.js` | Skills, items, resource nodes, recipes, monsters, upgrades |
| `sim.js` | Headless simulation: world generation, pathfinding, hero behaviour, autopilot |
| `render.js` | Canvas renderer (all art is drawn procedurally) |
| `main.js` | Game loop, saving, offline catch-up, side panels, input |

Tests (simulation only): `node --test idle-game/test/sim.test.js`
