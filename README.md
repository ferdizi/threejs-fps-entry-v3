[![Three.js FPS](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![Rank](https://make.fun/badge/threejs-fps-02/ferdizi/threejs-fps-entry-v3/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![Reward](https://make.fun/badge/threejs-fps-02/ferdizi/threejs-fps-entry-v3/reward.svg)](https://make.fun/bounty/threejs-fps-02)

# TIDEWATER v3 — a tactical Counter-Strike-style FPS for make.fun

A complete browser FPS built on three.js: 5v5, round economy, plant/defuse,
buy menu, HE + smoke grenades, HUD, minimap, and bot teammates/opponents —
on a harbor map with two sites.

## What's new in v3

- **Bots that think.** Every bot has a role (carrier, entry, support, flanker,
  anchor, mid patrol, retaker lead, retaker flank). Defenders hold angles and
  scan; the flanker crosses on a catwalk to hit the far site from behind;
  retakers coordinate — the lead pushes the site while the flank retaker
  crosses on the far catwalk, smokes the site, and defuses.
- **Bots that hear.** Gunshots (22 m), footsteps (12 m), and explosions
  (26 m) pull the nearest idle bots to investigate, so a loud push or a
  grenade gives your position away.
- **A map with a second floor.** Two climbable container platforms with
  stairs and a catwalk at 2.6 m, plus a second ground route to site B along
  the east wall. Bots climb the stairs, fight on the decks, and use the
  catwalks for flanks and retakes.
- **Bots that don't get stuck.** A stuck-breaker watches for a bot pushing a
  wall for 2.5 s, drops the unreachable waypoint, and re-paths around it.

## Play

```sh
node serve.ts
```

Open http://localhost:8000 — WASD move, mouse aim, click shoot, R reload,
1/2/3 weapons, G grenade, B buy menu, Shift walk (quiet).

## Layout

- `game/` — the game: `index.html` + `src/` (main, world, bots, player,
  weapon, grenades, hud, input, palette, textures, targets, audio)
- `main.ts` — builds `out/dossier.json` for the make.fun submission
- `serve.ts` — local dev server
- `screenshots/` — 1280×720 frames of the game in action
- `vendor/` — three.js
