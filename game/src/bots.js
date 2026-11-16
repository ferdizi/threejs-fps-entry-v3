// Bots: two squads of five, with roles. Attackers push a site and plant the pulse
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
      heardAt: -10, heardStepAt: -10, radioAt: -99, hadTarget: false, blindedUntil: 0,
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
    const rue = bots.find((b) => b.name === 'RUE');
    if (rue) { rue.retakeRole = 'lead'; rue.hold = holdAngle(-10, -11, -4, -6); }
    const finn = bots.find((b) => b.name === 'FINN');
    if (finn) { finn.retakeRole = 'flank'; finn.hold = holdAngle(13, -14.5, 14, -6); }
    // utility loadout: smoke for the pushes and the retake cover, HE for plants
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

  // Squad radio: one callout per bot per 8 s, via the main agent (throttled there).
  function areaName(x, z) {
    if (Math.hypot(x - world.sites.A.x, z - world.sites.A.z) < 9) return 'Site A';
    if (Math.hypot(x - world.sites.B.x, z - world.sites.B.z) < 9) return 'Site B';
    return 'Mid';
  }
  function say(bot, text) {
    if (!api.radio || api.time() - bot.radioAt < 8) return;
    bot.radioAt = api.time();
    api.radio(bot.name, text, bot.team);
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
    if (api.smokeBlocked && api.smokeBlocked(fromPos, toPos)) return false;
    return true;
  }

  // Sound: gunshots pull the two nearest idle enemies toward the noise (either
  function investigate(pos, listenTeam, radius, maxResponders, cooldownKey, cooldown, kind) {
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
    if (chosen.length && kind) {
      const label = kind === 'shot' ? 'Heard a shot' : kind === 'explosion' ? 'Heard an explosion' : 'Heard steps';
      say(chosen[0].bot, `${label}, ${areaName(pos.x, pos.z)}`);
    }
    return chosen.length;
  }

  function heardShot(pos, shooterTeam) {
    investigate(pos, shooterTeam === 'attack' ? 'defend' : 'attack', 22, 2, 'heardAt', 2, 'shot');
  }

  function heardStep(pos, stepperTeam) {
    investigate(pos, stepperTeam === 'attack' ? 'defend' : 'attack', 12, 1, 'heardStepAt', 3, 'step');
  }

  function heardExplosion(pos, throwerTeam) {
    investigate(pos, throwerTeam === 'attack' ? 'defend' : 'attack', 26, 2, 'heardAt', 2, 'explosion');
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
      if (bot.flank && bot.flankStage === 0) enemies = enemies.filter((e) => e.dist <= 8);
      bot.target = enemies.length ? enemies[0] : null;
      if (bot.target && !bot.hadTarget) say(bot, `Contact ${areaName(pos.x, pos.z)}`);
      bot.hadTarget = !!bot.target;
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
          say(bot, `In position — flanking ${bot.site}`);
        }
      }
      if (bot.channel) {
        if (bot.channel.kind === 'plant' && planted) bot.channel = null;
        if (bot.channel.kind === 'defuse' && !planted) bot.channel = null;
      }
      if (!bot.channel) {
        // --- utility: smoke the push, HE the plant or a held defender ---
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
            say(bot, `Smoking ${bot.site === 'A' ? 'Site A' : 'Site B'}`);
          }
        }
        if (bot.grenades.he > 0 && bot.team === 'defend' && planted) {
          const site = world.sites[planted];
          if (Math.hypot(pos.x - site.x, pos.z - site.z) < 18) {
            api.throwGrenade('he', eyeOf(bot).clone(), new THREE.Vector3(site.x, 1, site.z), bot);
            bot.grenades.he -= 1;
            say(bot, 'HE on the plant');
          }
        } else if (bot.grenades.he > 0 && bot.target && bot.target.dist > 10 && bot.target.dist < 20 && api.random() < 0.25) {
          api.throwGrenade('he', eyeOf(bot).clone(), new THREE.Vector3(bot.target.pos.x, 1, bot.target.pos.z), bot);
          bot.grenades.he -= 1;
          say(bot, 'HE out');
        }
        // retake smoke: the flank retaker screens the site before defusing
        if (planted && bot.team === 'defend' && bot.retakeRole === 'flank' && bot.grenades.smoke > 0 && !bot.retakeSmoked) {
          const site = world.sites[planted];
          if (Math.hypot(pos.x - site.x, pos.z - site.z) < 8) {
            api.throwGrenade('smoke', eyeOf(bot).clone(), new THREE.Vector3(site.x, 1, site.z), bot);
            bot.grenades.smoke -= 1;
            bot.retakeSmoked = true;
            say(bot, 'Smoking the site');
          }
        }
        // --- hearing footsteps: a fast enemy nearby gives itself away ---
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
                say(bot, 'Defusing — cover me');
              } else if (!bot.path.length) setPath(bot, site.x, site.z, farRouteFor(planted));
            } else if (d < 2.2) {
              bot.channel = { kind: 'defuse', site: planted, progress: 0 };
              bot.path = [];
              say(bot, 'Defusing — cover me');
            } else if (!bot.path.length) setPath(bot, site.x, site.z);
          } else if (!bot.path.length && !bot.target) {
            // attackers hold the planted site: spread around it, face the approach
            const offs = [[3, 0], [-3, 2], [2, -3], [-2, -2]];
            const off = offs[bots.indexOf(bot) % offs.length];
            setPath(bot, site.x + off[0], site.z + off[1]);
          }
        } else if (bot.team === 'attack' && bot.isCarrier) {
          // The carrier trails the entry fragger by 2.5 s and pushes on the
          if (bot.pushAt === 0) bot.pushAt = api.time() + 2.5;
          const site = world.sites[bot.site];
          const d = Math.hypot(pos.x - site.x, pos.z - site.z);
          if (api.time() < bot.pushAt) {
            bot.path = [];
          } else if (d < 2.4 && !bot.target) {
            bot.channel = { kind: 'plant', site: bot.site, progress: 0 };
            bot.path = [];
            say(bot, `Planting ${bot.site}, cover me`);
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
      if (bot.burstLeft > 0 && bot.burstAt <= 0 && api.time() >= bot.blindedUntil) {
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
