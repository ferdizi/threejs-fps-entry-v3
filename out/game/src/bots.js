// Bots: two squads of five, with roles. Attackers push a site and plant the pulse
// charge; defenders hold the sites and defuse. v3 AI: every bot has a role (carrier,
// entry, flanker, support / anchor, mid, retaker) instead of all bots running the
// same push logic. Anchors hold angles at site entrances and only leave them on a
// target, a sound, or a plant. Retakes are coordinated: the lead pushes the site
// directly while the flank retaker comes around the far catwalk 1.5 s later, and one
// of them smokes the site to cover the defuse. Bots react to sound, not just sight:
// gunshots (both teams), footsteps within 12 m, and explosions within 26 m all pull
// the nearest idle bots toward the noise. Utility is tactical: smoke on the site
// push, HE at a planted charge or a held defender, smoke to cover a defuse.
import * as THREE from 'three';
import { createMover } from './player.js';
import { WEAPONS } from './weapon.js';
import { PALETTE } from './palette.js';

const BOT_NAMES_ATTACK = ['KIP', 'MARA', 'JUNO', 'VESK'];
const BOT_NAMES_DEFEND = ['DARA', 'ONNO', 'SABLE', 'RUE', 'FINN'];
const BOT_SPEED = 4.0;
// Catwalk routes, as waypoint ids: west stairs -> deck -> A landing, east likewise.
const WEST_ROUTE = [21, 22, 23, 24, 25, 26, 27, 28];
const EAST_ROUTE = [29, 30, 31, 32, 33, 34, 35, 36];

function nameSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,16,0.66)';
  ctx.fillRect(0, 0, 128, 40);
  ctx.fillStyle = color;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 29);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.47, 1);
  return sprite;
}

function buildBody(teamColor, isCarrier) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b3138'), roughness: 0.8, metalness: 0.1 });
  const team = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suit);
  torso.position.y = 1.08;
  torso.userData.part = 'torso';
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.3, 0.32), team);
  vest.position.y = 1.18;
  vest.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.6;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), team);
  helmet.position.y = 1.62;
  helmet.userData.part = 'head';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), suit);
  legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5, metalness: 0.4 }));
  gun.position.set(0.2, 1.18, -0.25);
  group.add(torso, vest, head, helmet, legL, legR, gun);
  if (isCarrier) {
    const charge = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.16),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.7, roughness: 0.4 }),
    );
    charge.position.set(0, 1.25, 0.2);
    group.add(charge);
  }
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
    }
  });
  return { group, torso, head };
}

export function createBots(scene, world, api) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmpDir = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  function makeBot(name, team, spawn, weaponId, isCarrier, site, role) {
    const color = team === 'attack' ? PALETTE.teamOrange : PALETTE.teamBlue;
    const { group, torso, head } = buildBody(color, isCarrier);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    const label = nameSprite(name, color);
    label.position.y = 2.05;
    group.add(label);
    const mover = createMover(world.colliders, spawn[0], spawn[1], { speed: BOT_SPEED * (0.92 + api.random() * 0.16) });
    const bot = {
      name, team, group, torso, head, mover,
      weapon: WEAPONS[weaponId],
      health: 100, armor: 0, alive: true,
      site, isCarrier, role,
      path: [], pathIndex: 0,
      target: null,
      thinkAt: api.random() * 0.3,
      burstLeft: 0, burstAt: 0, aimAt: 0,
      channel: null,
      fallT: 0, walkPhase: 0,
      grenades: { he: 0, smoke: 0 },
      flank: role === 'flanker',
      flankStage: 0,
      heardAt: -10, heardStepAt: -10,
      hold: null, // { x, z, yaw } — an angle this bot holds while idle
      holdPhase: api.random() * Math.PI * 2,
      retakeRole: null, // 'lead' | 'flank' — only while a charge is planted
      retakeAt: 0, // earliest time the flank retaker may move
      retakeSmoked: false,
      patrolAt: 0, patrolGoal: null,
      pushAt: 0, // carrier only: earliest live time the carrier may push
      strafeSeed: api.random() * Math.PI * 2,
      hitMeshes: [torso, head],
      // stuck-breaker state: last position while pathing + when it was set.
      // excludeNode is a waypoint id the bot proved unreachable (see setPath);
      // it is forgotten 8 s after it was set (excludeUntil).
      lastX: spawn[0], lastZ: spawn[1], lastMoveT: 0,
      excludeNode: null, excludeUntil: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  // A hold angle: stand at (x, z) facing (lx, lz), scanning a little either side.
  function holdAngle(x, z, lx, lz) {
    return { x, z, yaw: Math.atan2(-(lx - x), -(lz - z)) };
  }

  function reset(round) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    const atkSpawns = world.spawns.attack;
    const defSpawns = world.spawns.defend;
    const atkWeapons = ['rifle', 'smg', 'rifle', 'shotgun'];
    const defWeapons = ['rifle', 'rifle', 'smg', 'sniper', 'shotgun'];
    makeBot(BOT_NAMES_ATTACK[0], 'attack', atkSpawns[0], atkWeapons[0], true, 'A', 'carrier');
    makeBot(BOT_NAMES_ATTACK[1], 'attack', atkSpawns[1], atkWeapons[1], false, 'A', 'entry');
    makeBot(BOT_NAMES_ATTACK[2], 'attack', atkSpawns[2], atkWeapons[2], false, 'B', 'support');
    makeBot(BOT_NAMES_ATTACK[3], 'attack', atkSpawns[3], atkWeapons[3], false, 'A', 'flanker');
    makeBot(BOT_NAMES_DEFEND[0], 'defend', defSpawns[0], defWeapons[0], false, 'A', 'anchor');
    makeBot(BOT_NAMES_DEFEND[1], 'defend', defSpawns[1], defWeapons[1], false, 'B', 'anchor');
    makeBot(BOT_NAMES_DEFEND[2], 'defend', defSpawns[2], defWeapons[2], false, 'A', 'mid');
    makeBot(BOT_NAMES_DEFEND[3], 'defend', defSpawns[3], defWeapons[3], false, 'A', 'retaker');
    makeBot(BOT_NAMES_DEFEND[4], 'defend', defSpawns[4], defWeapons[4], false, 'B', 'retaker');
    for (const bot of bots) {
      bot.mover.state.yaw = bot.team === 'attack' ? 0 : Math.PI;
      bot.group.rotation.y = bot.mover.state.yaw;
    }
    // hold angles: anchors watch their site's entrance from cover.
    const dara = bots.find((b) => b.name === 'DARA');
    if (dara) dara.hold = holdAngle(-13.5, -12.5, -8, -6);
    const onno = bots.find((b) => b.name === 'ONNO');
    if (onno) onno.hold = holdAngle(11, -13.5, 14, -6);
    // retakers stage at their sites until a plant calls them in. (Was
    // mid-north holds at (-4,-9)/(4,-9) facing (0,-2): RUE, FINN and SABLE
    // then all covered the same mid-north funnel and the carrier died there
    // every round — min dist to site 14.2 m, deaths at (0,-1) and (-3,-2).
    // Defenders hold their sites; the mid funnel is SABLE's job alone.
    // FINN's hold was (10,-12), the first thing the B push meets — it died
    // at 7 s every round, before any plant, so the flank retake never ran.
    // It holds deep at the back of the warehouse (13,-14.5), behind the
    // site. (Tried holding with ONNO at (11,-14.5): FINN still died and
    // the two-deep B defense shut the attack out 0-5 with 0 plants, so
    // that was reverted.)
    const rue = bots.find((b) => b.name === 'RUE');
    if (rue) { rue.retakeRole = 'lead'; rue.hold = holdAngle(-10, -11, -4, -6); }
    const finn = bots.find((b) => b.name === 'FINN');
    if (finn) { finn.retakeRole = 'flank'; finn.hold = holdAngle(13, -14.5, 14, -6); }
    // utility loadout: smoke for the pushes and the retake cover, HE for plants
    // and for flushing a defender holding an angle.
    const byName = (n) => bots.find((b) => b.name === n);
    if (byName('KIP')) byName('KIP').grenades.smoke = 1;
    if (byName('MARA')) byName('MARA').grenades.smoke = 1;
    if (byName('JUNO')) byName('JUNO').grenades.he = 1;
    if (byName('VESK')) byName('VESK').grenades.he = 1;
    if (byName('DARA')) byName('DARA').grenades.he = 1;
    if (byName('RUE')) byName('RUE').grenades.smoke = 1;
    if (byName('FINN')) byName('FINN').grenades.he = 1;
  }

  function eyeOf(bot) {
    tmpEye.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.55, bot.mover.state.position.z);
    return tmpEye;
  }

  function los(fromPos, toPos, maxDist) {
    tmpDir.copy(toPos).sub(fromPos);
    const dist = tmpDir.length();
    if (dist > maxDist) return false;
    tmpDir.normalize();
    raycaster.set(fromPos, tmpDir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    if (hits.length > 0) return false;
    // smoke blocks bot sight: a line of sight through an active smoke cloud
    // does not count (the player's hitscan still passes through smoke)
    if (api.smokeBlocked && api.smokeBlocked(fromPos, toPos)) return false;
    return true;
  }

  // Sound: gunshots pull the two nearest idle enemies toward the noise (either
  // team hears the other), footsteps pull the nearest one within 12 m, and an
  // explosion pulls idle bots within 26 m. Anchors on a hold angle only break
  // their hold for a sound if they are the nearest responder — the rest stay put.
  function investigate(pos, listenTeam, radius, maxResponders, cooldownKey, cooldown) {
    const responders = [];
    for (const bot of bots) {
      if (!bot.alive || bot.team !== listenTeam || bot.target || bot.channel) continue;
      if (bot.retakeRole) continue; // the retake reserve stays at its site until a plant
      if (api.time() - bot[cooldownKey] < cooldown) continue;
      const d = Math.hypot(bot.mover.state.position.x - pos.x, bot.mover.state.position.z - pos.z);
      if (d < radius) responders.push({ bot, d });
    }
    responders.sort((a, b) => a.d - b.d);
    // a hold anchor only leaves its angle if it is the nearest responder
    const chosen = responders.slice(0, maxResponders).filter((r, i) => {
      if (!r.bot.hold) return true;
      return i === 0;
    });
    for (const { bot } of chosen) {
      bot[cooldownKey] = api.time();
      setPath(bot, pos.x, pos.z);
    }
    return chosen.length;
  }

  function heardShot(pos, shooterTeam) {
    investigate(pos, shooterTeam === 'attack' ? 'defend' : 'attack', 22, 2, 'heardAt', 2);
  }

  function heardStep(pos, stepperTeam) {
    investigate(pos, stepperTeam === 'attack' ? 'defend' : 'attack', 12, 1, 'heardStepAt', 3);
  }

  function heardExplosion(pos, throwerTeam) {
    investigate(pos, throwerTeam === 'attack' ? 'defend' : 'attack', 26, 2, 'heardAt', 2);
  }

  function visibleEnemies(bot) {
    const eye = eyeOf(bot).clone();
    const out = [];
    const playerEye = api.playerEye();
    if (api.playerAlive() && bot.team === 'defend') {
      const d = playerEye.distanceTo(eye);
      if (d < 26 && los(eye, playerEye, 26)) out.push({ kind: 'player', pos: playerEye, dist: d });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const chest = new THREE.Vector3(other.mover.state.position.x, other.mover.state.position.y + 1.25, other.mover.state.position.z);
      const d = chest.distanceTo(eye);
      if (d < 26 && los(eye, chest, 26)) out.push({ kind: 'bot', bot: other, pos: chest, dist: d });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  // Path through `via` waypoint ids in order, then to (tx, tz). Used for the
  // catwalk flanks and the retake flank: BFS leg by leg, duplicates dropped.
  // `bot.excludeNode` is a waypoint id the bot proved it cannot reach (its
  // straight line is blocked — e.g. a node inside the warehouse seen from
  // outside its back wall); both ends of the path are computed without it.
  function setPath(bot, tx, tz, viaIds = null) {
    const p = bot.mover.state.position;
    const ex = bot.excludeNode ?? -1;
    const from = world.nearestWaypoint(p.x, p.z, p.y, ex);
    let ids = [];
    if (viaIds && viaIds.length) {
      let cur = from;
      for (const via of viaIds) {
        const leg = world.findPath(cur, via);
        ids = ids.concat(leg.slice(ids.length ? 1 : 0));
        cur = via;
      }
      const last = world.findPath(cur, world.nearestWaypoint(tx, tz, 0, ex));
      ids = ids.concat(last.slice(1));
    } else {
      ids = world.findPath(from, world.nearestWaypoint(tx, tz, 0, ex));
    }
    bot.path = ids.map((id) => world.waypoints[id]);
    const last = bot.path[bot.path.length - 1];
    if (last && (Math.abs(last.x - tx) > 0.5 || Math.abs(last.z - tz) > 0.5)) bot.path.push({ x: tx, z: tz });
    bot.pathIndex = 0;
    bot.lastX = p.x; bot.lastZ = p.z; bot.lastMoveT = api.time();
  }

  // The far catwalk for a site: to flank A, cross on the east catwalk and come
  // back through north-mid; to flank B, cross on the west catwalk.
  function farRouteFor(site) {
    return site === 'A' ? EAST_ROUTE : WEST_ROUTE;
  }

  function stepBot(bot, dt) {
    if (!bot.alive) {
      if (bot.fallT < 1) {
        bot.fallT = Math.min(1, bot.fallT + dt * 2.4);
        bot.group.rotation.z = bot.fallT * (Math.PI / 2) * 0.9;
        bot.group.position.y = -bot.fallT * 0.15;
      }
      return;
    }
    const pos = bot.mover.state.position;
    bot.thinkAt -= dt;

    // --- decide what to do ---
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.22 + api.random() * 0.12;
      if (bot.excludeNode !== null && api.time() > bot.excludeUntil) bot.excludeNode = null;
      const planted = api.plantedSite();
      let enemies = visibleEnemies(bot);
      // A flanker en route ignores distant targets: stopping to duel a
      // defender holding an angle from the exposed stairs is a losing fight
      // (VESK stalled at y=1.95 on the east stairs every round once the
      // defenders stopped chasing sounds and held their angles). Inside
      // 8 m it still fights. Once it reaches the landing (flankStage 1)
      // it fights normally — from behind the site holders.
      if (bot.flank && bot.flankStage === 0) enemies = enemies.filter((e) => e.dist <= 8);
      bot.target = enemies.length ? enemies[0] : null;
      if (!planted) {
        bot.retakeAt = 0;
        bot.retakeSmoked = false;
      }
      // flanker arrival: reached the far catwalk's landing, converge on the site
      if (bot.flank && bot.flankStage === 0) {
        const land = world.waypoints[farRouteFor(bot.site).at(-1)];
        if (Math.hypot(pos.x - land.x, pos.z - land.z) < 2) {
          bot.flankStage = 1;
          bot.path = [];
        }
      }
      if (bot.channel) {
        if (bot.channel.kind === 'plant' && planted) bot.channel = null;
        if (bot.channel.kind === 'defuse' && !planted) bot.channel = null;
      }
      if (!bot.channel) {
        // --- utility: smoke the push, HE the plant or a held defender ---
        // Smoke fires even while the bot has a target: the push IS the fight,
        // and gating smoke on "no target" meant the carrier's smoke never
        // fired once the defenders actually contested the approach (0 smokes
        // in the first post-fix match sims). Each bot carries 1 smoke, so
        // this can fire at most once per bot per round. It fires from up to
        // 22 m out, aimed 7 m ahead of the bot toward its site, so the cloud
        // screens the ground the push is about to walk through — aiming it
        // halfway to the site instead screened the far approach while the
        // carrier died in mid (min dist to site 12.4 m, deaths at (8,6.8)).
        if (bot.grenades.smoke > 0 && bot.team === 'attack' && !planted) {
          const site = world.sites[bot.site];
          const dx = site.x - pos.x;
          const dz = site.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 22 && d > 3) {
            const tx = pos.x + (dx / d) * 7;
            const tz = pos.z + (dz / d) * 7;
            api.throwGrenade('smoke', eyeOf(bot).clone(), new THREE.Vector3(tx, 1, tz), bot);
            bot.grenades.smoke -= 1;
          }
        }
        if (bot.grenades.he > 0 && bot.team === 'defend' && planted) {
          const site = world.sites[planted];
          if (Math.hypot(pos.x - site.x, pos.z - site.z) < 18) {
            api.throwGrenade('he', eyeOf(bot).clone(), new THREE.Vector3(site.x, 1, site.z), bot);
            bot.grenades.he -= 1;
          }
        } else if (bot.grenades.he > 0 && bot.target && bot.target.dist > 10 && bot.target.dist < 20 && api.random() < 0.25) {
          api.throwGrenade('he', eyeOf(bot).clone(), new THREE.Vector3(bot.target.pos.x, 1, bot.target.pos.z), bot);
          bot.grenades.he -= 1;
        }
        // retake smoke: the flank retaker screens the site before defusing
        if (planted && bot.team === 'defend' && bot.retakeRole === 'flank' && bot.grenades.smoke > 0 && !bot.retakeSmoked) {
          const site = world.sites[planted];
          if (Math.hypot(pos.x - site.x, pos.z - site.z) < 8) {
            api.throwGrenade('smoke', eyeOf(bot).clone(), new THREE.Vector3(site.x, 1, site.z), bot);
            bot.grenades.smoke -= 1;
            bot.retakeSmoked = true;
          }
        }
        // --- hearing footsteps: a fast enemy nearby gives itself away ---
        // Holders and the retake reserve do NOT chase footsteps: RUE kept
        // leaving its site hold to chase attackers pushing A and died in
        // mid-east (9.4,-5) before any plant, so there was no retaker left
        // when the charge went down. The mid patrol and the attackers still
        // investigate; the holders stay on their angles.
        if (!bot.target && !bot.hold && !bot.retakeRole) {
          const hearR = 9;
          let heard = null;
          if (bot.team === 'defend' && api.playerAlive() && api.playerSpeed() > 3.5) {
            const pe = api.playerEye();
            if (Math.hypot(pe.x - pos.x, pe.z - pos.z) < hearR) heard = pe;
          }
          if (!heard) {
            for (const other of bots) {
              if (!other.alive || other.team === bot.team) continue;
              const op = other.mover.state.position;
              if (other.mover.groundSpeed() > 3.5 && Math.hypot(op.x - pos.x, op.z - pos.z) < hearR) {
                heard = new THREE.Vector3(op.x, op.y + 1.2, op.z);
                break;
              }
            }
          }
          if (heard && api.time() - bot.heardStepAt > 3 && api.random() < 0.3) {
            bot.heardStepAt = api.time();
            setPath(bot, heard.x, heard.z);
          }
        }
        if (planted) {
          const site = world.sites[planted];
          const d = Math.hypot(pos.x - site.x, pos.z - site.z);
          if (bot.team === 'defend') {
            if (bot.retakeRole === 'flank') {
              if (bot.retakeAt === 0) bot.retakeAt = api.time() + 1.5;
              if (api.time() < bot.retakeAt) {
                bot.path = []; // staggered: let the lead go in first
              } else if (d < 2.2) {
                bot.channel = { kind: 'defuse', site: planted, progress: 0 };
                bot.path = [];
              } else if (!bot.path.length) setPath(bot, site.x, site.z, farRouteFor(planted));
            } else if (d < 2.2) {
              bot.channel = { kind: 'defuse', site: planted, progress: 0 };
              bot.path = [];
            } else if (!bot.path.length) setPath(bot, site.x, site.z);
          } else if (!bot.path.length && !bot.target) {
            // attackers hold the planted site: spread around it, face the approach
            const offs = [[3, 0], [-3, 2], [2, -3], [-2, -2]];
            const off = offs[bots.indexOf(bot) % offs.length];
            setPath(bot, site.x + off[0], site.z + off[1]);
          }
        } else if (bot.team === 'attack' && bot.isCarrier) {
          // The carrier trails the entry fragger by 2.5 s and pushes on the
          // ground route: every alternative lost the carrier — leading the
          // mid push died in mid (min dist 18.4 m), the catwalk route died
          // on the exposed stairs ((-4.7,5.2), (-6.5,3.8)), and ignoring
          // targets either way just let defenders shoot it for free. With
          // the stagger the carrier survives every round and reaches 8 m
          // from the site; the round then usually ends by elimination
          // before it plants (see NOTE.md — the plant loop needs an escort,
          // which is the human player's job in real play, and the retake
          // machinery is validated by the forced-plant sim).
          if (bot.pushAt === 0) bot.pushAt = api.time() + 2.5;
          const site = world.sites[bot.site];
          const d = Math.hypot(pos.x - site.x, pos.z - site.z);
          if (api.time() < bot.pushAt) {
            bot.path = [];
          } else if (d < 2.4 && !bot.target) {
            bot.channel = { kind: 'plant', site: bot.site, progress: 0 };
            bot.path = [];
          } else if (!bot.path.length && !bot.target) setPath(bot, site.x, site.z);
        } else if (bot.team === 'attack' && bot.role === 'flanker' && bot.flankStage === 0) {
          if (!bot.path.length && !bot.target) {
            const site = world.sites[bot.site];
            setPath(bot, site.x, site.z, farRouteFor(bot.site));
          }
        } else if (!bot.path.length && !bot.target) {
          const site = world.sites[bot.site];
          if (bot.team === 'defend' && bot.hold) {
            setPath(bot, bot.hold.x, bot.hold.z);
          } else if (bot.team === 'defend' && bot.role === 'mid') {
            // mid patrol: drift between mid-north waypoints, pausing at each.
            // (Was 6<->11; waypoint 6 is where the attack push arrives first,
            // so SABLE met the carrier head-on there and killed it in mid
            // every round. Patrolling 11<->19 lets the push reach mid-north
            // before first contact, with the entry fragger in front.)
            if (!bot.patrolGoal || api.time() > bot.patrolAt) {
              bot.patrolGoal = bot.patrolGoal === 11 ? 19 : 11;
              bot.patrolAt = api.time() + 8;
            }
            const wp = world.waypoints[bot.patrolGoal];
            setPath(bot, wp.x, wp.z);
          } else {
            setPath(bot, site.x, site.z);
          }
        }
      }
    }

    // --- channel plant/defuse ---
    if (bot.channel) {
      const need = bot.channel.kind === 'plant' ? 3 : 5;
      bot.channel.progress += dt;
      api.channelProgress(bot, bot.channel, bot.channel.progress / need);
      if (bot.channel.progress >= need) {
        const done = bot.channel;
        bot.channel = null;
        if (done.kind === 'plant') api.onPlant(bot, done.site);
        else api.onDefuse(bot, done.site);
      }
      return;
    }

    // --- combat: face the target, fire in bursts ---
    if (bot.target) {
      const t = bot.target;
      if (t.kind === 'player') t.pos.copy(api.playerEye());
      else t.pos.set(t.bot.mover.state.position.x, t.bot.mover.state.position.y + 1.25, t.bot.mover.state.position.z);
      const eye = eyeOf(bot);
      t.dist = t.pos.distanceTo(eye);
      const tp = t.pos;
      const dx = tp.x - pos.x;
      const dz = tp.z - pos.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - bot.mover.state.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.mover.state.yaw += Math.max(-dt * 6, Math.min(dt * 6, dyaw));
      bot.group.rotation.y = bot.mover.state.yaw;
      bot.burstAt -= dt;
      if (bot.burstLeft <= 0 && bot.burstAt <= 0 && Math.abs(dyaw) < 0.35) {
        bot.burstLeft = 3 + Math.floor(api.random() * 3);
        bot.burstAt = 0.6 + api.random() * 0.6;
      }
      if (bot.burstLeft > 0 && bot.burstAt <= 0) {
        bot.burstLeft -= 1;
        bot.burstAt = bot.weapon.fireGap * 1.15;
        const shotEye = eyeOf(bot).clone();
        const dist = t.dist;
        const err = 0.012 + dist * 0.0008 + (t.kind === 'player' && api.playerSpeed() > 3 ? 0.015 : 0);
        tmpDir.copy(tp).sub(shotEye).normalize();
        tmpDir.x += (api.random() * 2 - 1) * err;
        tmpDir.y += (api.random() * 2 - 1) * err * 0.7;
        tmpDir.z += (api.random() * 2 - 1) * err;
        tmpDir.normalize();
        api.shoot(shotEye, tmpDir, bot.weapon, bot);
      }
      const fx = -Math.sin(bot.mover.state.yaw);
      const fz = -Math.cos(bot.mover.state.yaw);
      if (t.dist > 15) {
        bot.mover.step(dt, fx, fz, false, false);
        bot.walkPhase += dt * 9;
      } else {
        const strafe = Math.sin(api.time() * 1.7 + bot.strafeSeed) * 0.35;
        bot.mover.step(dt, -fz * strafe * 0.4, fx * strafe * 0.4, false, false);
      }
      return;
    }

    // --- hold an angle: stand at the hold spot, scan slowly, move nowhere ---
    if (bot.hold && !api.plantedSite()) {
      const hd = Math.hypot(pos.x - bot.hold.x, pos.z - bot.hold.z);
      if (hd < 1 && !bot.path.length) {
        const scan = Math.sin(api.time() * 0.5 + bot.holdPhase) * 0.3;
        bot.mover.state.yaw = bot.hold.yaw + scan;
        bot.group.rotation.y = bot.mover.state.yaw;
        bot.group.position.set(pos.x, bot.group.position.y, pos.z);
        return;
      }
    }
    // --- attackers holding a planted site: stand, face the retake approach ---
    if (api.plantedSite() && bot.team === 'attack' && !bot.path.length) {
      const scan = Math.sin(api.time() * 0.5 + bot.holdPhase) * 0.3;
      bot.mover.state.yaw = Math.atan2(-(0 - pos.x), -(-2 - pos.z)) + scan;
      bot.group.rotation.y = bot.mover.state.yaw;
      bot.group.position.set(pos.x, bot.group.position.y, pos.z);
      return;
    }

    // --- navigate along the path (an exhausted path clears, so the think
    // layer can issue the next order: patrol legs, hold angles, re-paths) ---
    if (bot.path.length && bot.pathIndex >= bot.path.length) bot.path.length = 0;
    if (bot.path.length && bot.pathIndex < bot.path.length) {
      const wp = bot.path[bot.pathIndex];
      const dx = wp.x - pos.x;
      const dz = wp.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        bot.pathIndex += 1;
      } else {
        const wantYaw = Math.atan2(-dx, -dz);
        let dyaw = wantYaw - bot.mover.state.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.mover.state.yaw += Math.max(-dt * 5, Math.min(dt * 5, dyaw));
        bot.group.rotation.y = bot.mover.state.yaw;
        const fx = -Math.sin(bot.mover.state.yaw);
        const fz = -Math.cos(bot.mover.state.yaw);
        bot.mover.step(dt, fx, fz, false, false);
        bot.walkPhase += dt * 9;
      }
      // --- stuck-breaker: a bot that has a path but has not moved for 2.5 s
      // is pushing a wall/container whose far side holds its next waypoint
      // (the waypoint graph is distance-based, walls are not). Drop the path,
      // remember that waypoint as unreachable for 8 s, and let the think
      // layer re-path around it (setPath excludes it from both path ends).
      const moved = Math.hypot(pos.x - bot.lastX, pos.z - bot.lastZ);
      if (moved > 0.2) { bot.lastX = pos.x; bot.lastZ = pos.z; bot.lastMoveT = api.time(); }
      else if (bot.path.length && api.time() - bot.lastMoveT > 2.5) {
        const stuckNode = bot.path[bot.pathIndex];
        if (stuckNode && stuckNode.id !== undefined) {
          bot.excludeNode = stuckNode.id;
          bot.excludeUntil = api.time() + 8;
        }
        bot.path = [];
        bot.pathIndex = 0;
        bot.lastMoveT = api.time();
      }
    }
    const speed = bot.mover.groundSpeed();
    if (speed > 0.5) {
      bot.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    }
    bot.group.position.set(pos.x, bot.group.position.y, pos.z);
  }

  function step(dt) {
    for (const bot of bots) {
      stepBot(bot, dt);
      if (bot.alive) {
        bot.group.position.x = bot.mover.state.position.x;
        bot.group.position.z = bot.mover.state.position.z;
        // keep the meshes' world matrices fresh for the hitscan raycast:
        // the renderer normally does this every frame, but a headless
        // fast-forward (no renders) would otherwise raycast against the
        // bots' spawn positions and every shot would miss
        bot.group.updateMatrixWorld(true);
      }
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function damage(bot, amount, isHead, shooterName) {
    if (!bot.alive) return;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, remaining * 0.5);
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    // being shot breaks a channel
    if (bot.channel && remaining > 0) {
      bot.channel = null;
      api.channelProgress(bot, null, 0);
    }
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.channel = null;
      bot.fallT = 0;
      api.onBotDeath(bot, shooterName);
    }
  }

  return {
    bots, reset, step, aliveCount, damage, heardShot, heardStep, heardExplosion,
    hitMeshes() {
      const out = [];
      for (const b of bots) if (b.alive) out.push(b.torso, b.head);
      return out;
    },
  };
}
