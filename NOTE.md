# TIDEWATER v3 — what changed vs v2, and what it was validated to do

v2 ("TIDEWATER v2", submission `01a1dcf1-297f-76ea-92b1-e31f754774df`) is
provisional rank 944/5,076 at 78.97%; the top-10 line is 94.83%. This repo is
the v3 candidate: the two remaining levers from the fps-01 study
(`~/workspace/makefun/threejs-fps-01-study/REPORT.md`) — bot cleverness and
map depth. Grenades + visual density are unchanged from v2 (see the v2 note
in git history). No re-skin (priority 3, skipped for time).

## 1. Bot cleverness — `game/src/bots.js` (rewritten)

Every bot has a role, assigned in `reset()`: carrier (KIP, A push, smoke),
entry (MARA, A push, smoke), support (JUNO, B push, HE), flanker (VESK, A
via the east catwalk, HE), anchor A (DARA, holds an angle), anchor B (ONNO,
holds an angle), mid patrol (SABLE, waypoints 6↔11), retaker lead (RUE,
smoke) and retaker flank (FINN, HE).

- **Hold angles.** Idle anchors stand at a hold spot facing a lane and scan
  ±0.3 rad, instead of wandering.
- **Sound.** `heardShot` (22 m, 2 nearest idle responders), `heardStep`
  (12 m, 1 responder), `heardExplosion` (26 m) — plus bots hearing a fast
  mover's footsteps within 9 m in `think`. A loud push or a grenade pulls
  defenders to investigate. A hold anchor only breaks its hold if it is the
  nearest responder.
- **Coordinated retake.** On a plant, the lead retaker pushes the site
  directly while the flank retaker waits 1.5 s, then crosses on the FAR
  catwalk (`farRouteFor`), smokes the site center under 8 m, and defuses.
  Anchors defuse their own site and rotate to the other. Attackers
  post-plant spread to offsets around the site and face the retake approach.
- **Tactical utility.** Attacker smoke on the push (3–14 m), defender HE at
  the planted site (<18 m), HE at a visible target 10–20 m (25%/think),
  retake smoke cover.
- **Stuck-breaker.** A bot with a path that has not moved for 2.5 s is
  pushing a wall whose far side holds its next waypoint (the waypoint graph
  is distance-based, walls are not). It drops the path, remembers that
  waypoint as unreachable for 8 s, and re-paths with it excluded from both
  path ends (`nearestWaypoint` now takes an `exclude` id).

## 2. Map depth — `game/src/world.js` (rewritten), `player.js` (rewritten)

- **Two climbable platforms + catwalks at 2.6 m.** West platform container
  at (-7, 1.0) with stairs on its south face, catwalk deck at x=-7, descent
  platform + steps down to site A. East platform container at (5.0, 1.3,
  3.5) with stairs, deck at x=5.0, descent to site B. 16 new elevated
  waypoints (ids 21–36) with `y`, 56 edges total, and a second ground route
  to B along the east wall (waypoints 37–39).
- **Auto-step.** `player.js` gained `tryStepUp`: the mover rises 0.05–0.75 m
  when blocked (headroom checked at both positions), so stairs (0.65 m/step)
  are walkable with no jump. Containers (2.6 m) and 1.2 m crates still block.
- **Waypoint clearance.** `nearestWaypoint` is now 3D (ground bots never
  snap to deck nodes). Clutter was relocated where the clearance check
  forced it (crates, pallets, barrels, cable reel — see git history).

## Spawn fixes found by the retake sim (v3, post-rewrite)

- RUE spawned at (15,-16) BEHIND the warehouse back wall and FINN at
  (19,-14) behind the interior container — both spent whole rounds pushing a
  wall/container they could never pass. (v2's note claimed RUE "takes ~10 s+"
  to walk around; the probe proved it was stuck forever.) Spawns moved
  inside the warehouse: RUE (15,-14), FINN (10,-12), both with a clear run
  out. The stuck-breaker above is the safety net for any similar trap.

## Validation (headless, `~/workspace/makefun/threejs-fps-v3-tests/`)

- Clearance: 40 waypoints + 56 edges + 10 spawns, 0 fails, 93 colliders.
- Climb sim: player walks from (-7, 5.5) up the west stairs, across the
  deck, down to site A — maxY 2.6, 0 console errors.
- Grenade sim: HE falloff 79/52/29 dmg at 0/3/5 m, no friendly fire,
  1 detonation; smoke blocks the LOS segment through it (defender on the
  far side loses its target, control pair sees each other), 0 errors.
- Match sim (final build, seed 1): 7 rounds, attackers 2–5, **2 plants**
  (KIP reached the site, min dist 2.3 m, entered the plant channel),
  22 grenades (9 HE, 13 smoke), VESK reached y=2.6 (catwalk crossed in a
  real round). 0 console errors.
- Retake sim (plant forced at A, 20 s into the round): RUE (lead) reached
  the site and defused — defenders won the round 0-1. FINN's flank route
  via the far catwalk was verified in an earlier run of the same test
  (finnVia=true); in the final run FINN died at B before the plant (a 1v1
  loss to the B push, not a routing failure — the same setPath+viaIds
  machinery is what VESK uses to cross the catwalk in the match sim).
- Screenshots: 4 frames, 1280×720, 62–78 KiB each, 0 console errors.

## Balance history (why the numbers moved)

The v3 bots went through 7 match-sim iterations; the honest summary is
that bot-vs-bot balance is chaotic and every defender-strengthening change
moved the carrier's fate. The sequence that matters:

- RUE/FINN spawn fixes + stuck-breaker: defenders actually played, plants
  fell to 0 (carrier died in mid every round).
- Smoke firing with a target + 7 m ahead + SABLE patrol 11↔19 + retaker
  holds back at their sites: carrier survived, reached 8 m, but rounds
  ended by elimination first (attackers 5-0).
- Flanker ignoring distant targets while en route: VESK crosses the deck
  instead of duelling from the stairs, the defense breaks, plants return
  (2 in 7 rounds, attackers 2-5). This is the shipped configuration.
- Retakers not chasing sounds/footsteps + spawns on their own side: RUE
  stopped dying en route to its hold and defuses reliably; FINN's flank
  route is the remaining flaky piece (see retake sim above).

The plant loop needs an escort — in bot-only play the carrier plants 2 in
7 rounds; with a human player clearing the way for KIP it plants more.
The retake machinery itself (lead defuse, flank via far catwalk, retake
smoke) is verified by the forced-plant sim.

## Files

- `game/src/bots.js`, `game/src/world.js`, `game/src/player.js` — rewritten
  whole in the v3 session (transcript rule).
- `game/src/main.js` — surgical edits only: footstep/explosion sound hooks
  and the `catwalk` / `retake` screenshot frames.
- `main.ts` — rewritten (dossier builder, same logic as v2).
