// TIDEWATER — round-based tactical FPS. Main loop, rounds, economy, shooting,
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, ARMOR_PRICE, ARMOR_POINTS, HELMET_PRICE } from './weapon.js';
import { createGrenades, GRENADES, GRENADE_MAX } from './grenade.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const DETONATE_SECONDS = 40;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);

// ---- grenades: HE + smoke, player and bots ----
function damageRadius(pos, radius, maxDmg, throwerTeam, throwerName) {
  // AoE damage with falloff, no friendly fire (same-team targets are skipped)
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === throwerTeam) continue;
    const chest = new THREE.Vector3(bot.mover.state.position.x, bot.mover.state.position.y + 1.0, bot.mover.state.position.z);
    const d = chest.distanceTo(pos);
    if (d < radius) {
      const dmg = maxDmg * (1 - (d / radius) * 0.8);
      bots.damage(bot, dmg, false, throwerName);
    }
  }
  if (throwerTeam !== 'attack' && you.alive) {
    const pp = player.state.position;
    const d = new THREE.Vector3(pp.x, pp.y + 1.0, pp.z).distanceTo(pos);
    if (d < radius) hurtPlayer(maxDmg * (1 - (d / radius) * 0.8), throwerName);
  }
  // an explosion is audible: idle bots within 26 m investigate the blast
  bots.heardExplosion(pos, throwerTeam);
}

const grenades = createGrenades(scene, world, {
  random,
  time: () => elapsed,
  damageRadius,
  effects,
  audio,
  onFlash: (pos) => flashPop(pos),
});

const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpRay = new THREE.Ray();

// ---- match state ----
const match = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1,
  atkWins: 0,
  defWins: 0,
  lossStreak: 0,
  phaseT: 0,
  plantedSite: null,
  detonateT: 0,
  roundWinner: null,
  spectateBot: null,
};

const you = {
  health: 100,
  armor: 0,
  helmet: false,
  money: 800,
  alive: true,
  primary: 'rifle',
  hasPrimary: true,
  plantProgress: 0,
  planting: false,
  stepAt: 0,
  firedAt: 0,
  grenades: { he: 0, smoke: 0, flash: 0 },
  selectedGrenade: null, // 'he' | 'smoke' | 'flash' | null (null = gun selected)
  throwAt: -10,
};

let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let botChannels = new Map(); // bot -> { kind, site, progress }
let beepAt = 0;

const bots = createBots(scene, world, {
  random,
  time: () => elapsed,
  plantedSite: () => match.plantedSite,
  playerEye: () => {
    const p = player.state.position;
    return new THREE.Vector3(p.x, p.y + p.eye, p.z);
  },
  playerAlive: () => you.alive,
  playerSpeed: () => player.groundSpeed(),
  shoot: (origin, dir, def, shooter) => shoot(origin, dir, def, shooter),
  smokeBlocked: (from, to) => grenades.segmentBlockedBySmoke(from, to),
  throwGrenade: (kind, origin, target, bot) => grenades.throwArc(kind, origin, target, bot.team, bot.name),
  radio: (name, text, team) => radio(name, text, team),
  channelProgress: (bot, channel, progress) => {
    if (channel) botChannels.set(bot, { ...channel, progress });
    else botChannels.delete(bot);
  },
  onPlant: (bot, site) => { plantCharge(site, bot.name); },
  onDefuse: (bot, site) => { endRound('defend', `${bot.name} defused the charge`); },
  onBotDeath: (bot, killerName) => {
    hud.feed(killerName, bot.name, killerName === 'YOU' ? 'attack' : (bot.team === 'attack' ? 'defend' : 'attack'), false);
    if (killerName === 'YOU') {
      you.money += 300;
      hud.setMoney(you.money);
      audio.kill();
    }
    if (bot.isCarrier && bot.team === 'attack') {
      // the charge passes to the next living attacker bot
      const next = bots.bots.find((b) => b.alive && b.team === 'attack' && !b.isCarrier);
      if (next) {
        next.isCarrier = true;
        hud.showBanner('CHARGE DROPPED', `${bot.name} is down — ${next.name} has the charge`, 3000);
        radio(next.name, 'I have the charge', 'attack');
        const charge = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.26, 0.16),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.7 }),
        );
        charge.position.set(0, 1.25, 0.2);
        next.group.add(charge);
      }
    }
    checkRoundEnd();
  },
});

// ---- squad radio: at most one line per second, so the feed never floods ----
let lastRadioAt = -10;
function radio(name, text, team) {
  if (elapsed - lastRadioAt < 1.0) return;
  lastRadioAt = elapsed;
  hud.radio(name, text, team);
}
function areaName(x, z) {
  if (Math.hypot(x - world.sites.A.x, z - world.sites.A.z) < 9) return 'Site A';
  if (Math.hypot(x - world.sites.B.x, z - world.sites.B.z) < 9) return 'Site B';
  return 'Mid';
}
function squadList() {
  return bots.bots.filter((b) => b.team === 'attack').map((b) => ({ name: b.name, role: b.role, weapon: b.weapon.name }));
}
// ---- flash pop: blinds the player when facing it, blinds nearby bots for 3 s ----
function flashPop(pos) {
  if (you.alive) {
    const dir = new THREE.Vector3(
      -Math.sin(player.state.yaw) * Math.cos(player.state.pitch),
      Math.sin(player.state.pitch),
      -Math.cos(player.state.yaw) * Math.cos(player.state.pitch),
    );
    const to = new THREE.Vector3(
      pos.x - player.state.position.x,
      pos.y - (player.state.position.y + player.state.eye),
      pos.z - player.state.position.z,
    );
    if (to.length() < 30 && to.normalize().dot(dir) > 0.35) hud.flashPop();
  }
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const bp = b.mover.state.position;
    if (Math.hypot(bp.x - pos.x, bp.z - pos.z) < 18) b.blindedUntil = elapsed + 3;
  }
}

// ---- shooting: one hitscan path for the player and every bot ----
function shoot(origin, dir, def, shooter) {
  const pellets = def.pellets ?? 1;
  const shooterTeam = shooter === 'player' ? 'attack' : shooter?.team;
  let anyHit = false;
  for (let p = 0; p < pellets; p += 1) {
    const d = tmpVec.copy(dir);
    if (pellets > 1) {
      d.x += (random() * 2 - 1) * def.spreadStill * 2.2;
      d.y += (random() * 2 - 1) * def.spreadStill * 2.2;
      d.z += (random() * 2 - 1) * def.spreadStill * 2.2;
      d.normalize();
    }
    const end = tmpVec2.copy(origin).addScaledVector(d, def.range);
    raycaster.set(origin, d);
    raycaster.far = def.range;
    const targets = world.shootables.concat(bots.hitMeshes());
    const hits = raycaster.intersectObjects(targets, false);
    // first hit that is not a same-team bot (no friendly fire: a teammate in the
    let hit = null;
    for (const h of hits) {
      const hb = h.object.userData.bot;
      if (hb && hb.team === shooterTeam) continue;
      hit = h;
      break;
    }
    // player capsule (body + head spheres) when the shooter is a bot
    let playerHit = null;
    if (shooter !== 'player' && you.alive) {
      const pp = player.state.position;
      const bodySphere = new THREE.Sphere(new THREE.Vector3(pp.x, pp.y + 0.95, pp.z), 0.46);
      const headSphere = new THREE.Sphere(new THREE.Vector3(pp.x, pp.y + pp.eye + 0.08, pp.z), 0.2);
      tmpRay.origin.copy(origin);
      tmpRay.direction.copy(d);
      const tb = tmpRay.intersectSphere(bodySphere, new THREE.Vector3());
      const th = tmpRay.intersectSphere(headSphere, new THREE.Vector3());
      const tDist = th ? th.distanceTo(origin) : tb ? tb.distanceTo(origin) : null;
      if (tDist !== null && tDist < def.range && (!hit || tDist < hit.distance)) {
        playerHit = { distance: tDist, head: !!th, point: th ?? tb };
      }
    }
    const muzzle = origin.clone();
    if (playerHit) {
      const falloff = playerHit.distance > def.range * 0.6 ? 0.65 : 1;
      // a helmet halves headshot damage
      const headMult = playerHit.head ? (you.helmet ? def.headMult * 0.5 : def.headMult) : 1;
      const dmg = def.damage * headMult * falloff;
      hurtPlayer(dmg, shooter?.name ?? 'BOT');
      effects.tracer(muzzle, playerHit.point);
      anyHit = true;
    } else if (hit) {
      const endPoint = hit.point.clone();
      effects.tracer(muzzle, endPoint);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const isHead = hit.object.userData.part === 'head';
        const falloff = hit.distance > def.range * 0.6 ? 0.65 : 1;
        const dmg = def.damage * (isHead ? def.headMult : 1) * falloff;
        const wasAlive = bot.alive;
        bots.damage(bot, dmg, isHead, shooter === 'player' ? 'YOU' : shooter?.name);
        if (shooter === 'player') {
          hud.hitMarker(!bot.alive);
          audio.hit();
          if (wasAlive && !bot.alive) {
            hud.feed('YOU', bot.name, 'attack', isHead);
            you.money += 300;
            hud.setMoney(you.money);
            audio.kill();
          }
        }
        anyHit = true;
      } else {
        effects.impact(endPoint, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
        effects.dust(endPoint);
      }
    } else {
      effects.tracer(muzzle, end);
    }
  }
  // every shot is audible: the nearest defender without a target re-paths
  bots.heardShot(origin, shooterTeam);
  return anyHit;
}

function hurtPlayer(dmg, fromName) {
  if (!you.alive) return;
  let remaining = dmg;
  if (you.armor > 0) {
    const absorbed = Math.min(you.armor, remaining * 0.5);
    you.armor -= absorbed;
    remaining -= absorbed;
  }
  you.health -= remaining;
  hud.setHealth(you.health, you.armor);
  hud.damageFlash();
  audio.hurt();
  if (you.health <= 0) {
    you.health = 0;
    you.alive = false;
    you.planting = false;
    hud.setChannel(null);
    hud.showOverlay('dead', { round: match.round });
    if (document.pointerLockElement) document.exitPointerLock();
    match.spectateBot = bots.bots.find((b) => b.alive && b.team === 'attack') ?? null;
    checkRoundEnd();
  }
}

function plantCharge(site, byName) {
  if (match.plantedSite) return;
  match.plantedSite = site;
  match.detonateT = DETONATE_SECONDS;
  hud.showBanner('CHARGE PLANTED', `${byName} planted at ${world.sites[site].label} — defend it`, 3200);
  audio.plantStart();
  if (byName === 'YOU') {
    you.money += 300;
    hud.setMoney(you.money);
    radio('YOU', `Planting ${site} — cover me`, 'attack');
  } else {
    radio(byName, `Planting ${site}, cover me`, 'attack');
  }
}

function endRound(winner, reason) {
  if (match.phase !== 'live') return;
  match.phase = 'roundEnd';
  match.phaseT = 0;
  match.roundWinner = winner;
  if (winner === 'attack') {
    match.atkWins += 1;
    match.lossStreak = 0;
    you.money += 3250;
    audio.roundWin();
  } else {
    match.defWins += 1;
    match.lossStreak += 1;
    you.money += Math.min(3400, 1900 + (match.lossStreak - 1) * 500);
    audio.roundLose();
  }
  hud.setMoney(you.money);
  hud.setScore(match.atkWins, match.defWins, match.round);
  const title = winner === 'attack' ? 'TIDE RUNNERS TAKE THE ROUND' : 'HARBOR WATCH HOLD THE ROUND';
  hud.showBanner(title, reason, 4200);
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkRoundEnd() {
  if (match.phase !== 'live') return;
  if (match.plantedSite) return; // detonation/defuse decides it
  const atkAlive = bots.aliveCount('attack') + (you.alive ? 1 : 0);
  const defAlive = bots.aliveCount('defend');
  if (atkAlive === 0) endRound('defend', 'Tide Runners eliminated');
  else if (defAlive === 0) endRound('attack', 'Harbor Watch eliminated');
}

function startRound() {
  match.phase = 'live';
  match.phaseT = 0;
  match.plantedSite = null;
  botChannels.clear();
  // respawn the player
  const spawn = world.spawns.attack[2];
  player.state.position.set(spawn[0], 0, spawn[1]);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  you.health = 100;
  you.alive = true;
  you.plantProgress = 0;
  you.planting = false;
  if (!you.hasPrimary) weapon.equip('pistol');
  else weapon.equip(you.primary, true);
  weapon.refill();
  // bots were already placed by startBuyPhase and held through buy time —
  hud.hideOverlay();
  hud.setHealth(you.health, you.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setMoney(you.money);
  hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
  hud.setScore(match.atkWins, match.defWins, match.round);
  hud.setTimer(ROUND_SECONDS, false);
  hud.setAlive(bots.aliveCount('attack') + 1, bots.aliveCount('defend'));
  hud.showBanner(`ROUND ${match.round}`, 'Plant the charge at Site A or B — or eliminate the Harbor Watch', 2600);
  const carrier = bots.bots.find((b) => b.isCarrier && b.team === 'attack' && b.alive);
  if (carrier) radio(carrier.name, carrier.site === 'A' ? 'Pushing A — west catwalk' : 'Pushing B — east lane', 'attack');
  input.requestLock();
}

function startBuyPhase() {
  match.phase = 'buy';
  match.phaseT = 0;
  match.plantedSite = null;
  botChannels.clear();
  const spawn = world.spawns.attack[2];
  player.state.position.set(spawn[0], 0, spawn[1]);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  you.health = 100;
  you.alive = true;
  you.armor = 0;
  you.helmet = false;
  you.plantProgress = 0;
  you.planting = false;
  if (!you.hasPrimary) weapon.equip('pistol');
  else weapon.equip(you.primary, true);
  weapon.refill();
  bots.reset(match.round);
  grenades.clear(); // no live grenades or smoke carry into a new round
  hud.clearOwned();
  hud.setHealth(you.health, you.armor, you.helmet);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setMoney(you.money);
  hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
  hud.setScore(match.atkWins, match.defWins, match.round);
  hud.setTimer(BUY_SECONDS, false);
  hud.setAlive(bots.aliveCount('attack') + 1, bots.aliveCount('defend'));
  hud.openBuy(you.money, squadList());
  hud.setPrompt('B — buy menu · ENTER — deploy');
  if (document.pointerLockElement) document.exitPointerLock();
}

function endMatch() {
  match.phase = 'matchEnd';
  const won = match.atkWins > match.defWins;
  hud.showOverlay(won ? 'matchwin' : 'matchlose', { atk: match.atkWins, def: match.defWins });
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetMatch() {
  match.round = 1;
  match.atkWins = 0;
  match.defWins = 0;
  match.lossStreak = 0;
  match.plantedSite = null;
  you.money = 800;
  you.primary = 'rifle';
  you.hasPrimary = true;
  you.armor = 0;
  you.helmet = false;
  you.grenades = { he: 0, smoke: 0, flash: 0 };
  you.selectedGrenade = null;
  grenades.clear();
  startBuyPhase();
}

// ---- buy handling ----
function buy(id) {
  if (match.phase !== 'buy') return;
  if (id === 'he' || id === 'smoke' || id === 'flash') {
    if (you.grenades[id] >= GRENADE_MAX || you.money < GRENADES[id].price) return;
    you.money -= GRENADES[id].price;
    you.grenades[id] += 1;
    audio.buy();
  } else if (id === 'armor') {
    if (you.armor >= ARMOR_POINTS || you.money < ARMOR_PRICE) return;
    you.money -= ARMOR_PRICE;
    you.armor = ARMOR_POINTS;
    hud.setOwned('armor', true);
    audio.buy();
  } else if (id === 'helmet') {
    if (you.helmet || you.money < HELMET_PRICE) return;
    you.money -= HELMET_PRICE;
    you.helmet = true;
    hud.setOwned('helmet', true);
    hud.setHealth(you.health, you.armor, you.helmet);
    audio.buy();
  } else {
    const def = WEAPONS[id];
    if (!def || you.money < def.price) return;
    if (id === 'pistol') {
      weapon.equip('pistol');
      you.primary = 'pistol';
      you.hasPrimary = false;
    } else {
      if (you.primary === id) return; // already own it
      you.money -= def.price;
      you.primary = id;
      you.hasPrimary = true;
      weapon.equip(id);
      audio.buy();
    }
  }
  hud.setMoney(you.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
  hud.openBuy(you.money);
}

hud.onBuy(buy);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.phase === 'menu' || match.phase === 'matchEnd') resetMatch();
  else if (match.phase === 'buy') startRound();
  else if (!you.alive) {
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (match.phase === 'buy') hud.closeBuy();
  } else if (match.phase === 'live' && you.alive) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  if (!you.alive && match.spectateBot && match.spectateBot.alive) {
    const b = match.spectateBot;
    const p = b.mover.state.position;
    camera.position.set(p.x, p.y + 1.6, p.z);
    camera.rotation.set(0, b.mover.state.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = input.state.aiming && you.alive ? 58 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.5) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function throwPlayerGrenade() {
  const kind = you.selectedGrenade;
  if (!kind || you.grenades[kind] <= 0) return;
  const body = player.state;
  // throw along the aim direction with an upward bias (same as the camera)
  const dir = new THREE.Vector3(
    -Math.sin(body.yaw) * Math.cos(body.pitch),
    Math.sin(body.pitch),
    -Math.cos(body.yaw) * Math.cos(body.pitch),
  );
  const origin = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z)
    .addScaledVector(dir, 0.5);
  const vel = dir.clone().multiplyScalar(15);
  vel.y += 4.2;
  if (!grenades.throw(kind, origin, vel, 'attack', 'YOU')) return;
  you.grenades[kind] -= 1;
  you.throwAt = elapsed;
  if (you.grenades[kind] === 0) you.selectedGrenade = null;
  if (kind === 'smoke') radio('YOU', `Smoking ${areaName(body.position.x, body.position.z)}`, 'attack');
  else if (kind === 'flash') radio('YOU', 'Flash out', 'attack');
  audio.throwWhoosh();
  effects.dust(origin);
  hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
}

function playerShoot() {
  if (match.phase !== 'live' || !you.alive) return;
  if (!weapon.takeRound()) {
    audio.dryClick();
    weapon.reload();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed(), player.state.crouching) * (input.state.aiming ? 0.6 : 1);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  shoot(camera.position, direction, weapon.def, 'player');
  weapon.pullTrigger();
  player.recoil(0.009 + weapon.def.kick, (random() * 2 - 1) * 0.004);
  audio.shot(weapon.def.id);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  you.firedAt = elapsed;
}

// ---- per-frame simulation ----
function step(dt) {
  elapsed += dt;
  if (match.phase === 'buy') {
    match.phaseT += dt;
    hud.setTimer(Math.max(0, BUY_SECONDS - match.phaseT), false);
    if (match.phaseT >= BUY_SECONDS) {
      hud.closeBuy();
      hud.setPrompt('');
      startRound();
    }
  } else if (match.phase === 'live') {
    match.phaseT += dt;
    const remain = match.plantedSite
      ? DETONATE_SECONDS - match.detonateT
      : ROUND_SECONDS - match.phaseT;
    if (match.plantedSite) {
      match.detonateT -= dt;
      hud.setTimer(Math.max(0, match.detonateT), true);
      // accelerating beeps as the charge counts down
      const interval = match.detonateT > 20 ? 1.0 : match.detonateT > 10 ? 0.5 : 0.25;
      if (elapsed - beepAt > interval) {
        beepAt = elapsed;
        audio.beep(match.detonateT < 10);
      }
      if (match.detonateT <= 0) {
        audio.explosion();
        endRound('attack', `Charge detonated at ${world.sites[match.plantedSite].label}`);
        match.plantedSite = null;
      }
    } else {
      hud.setTimer(Math.max(0, ROUND_SECONDS - match.phaseT), false);
      if (match.phaseT >= ROUND_SECONDS) {
        endRound('defend', 'Time expired — Harbor Watch hold the sites');
      }
    }
  } else if (match.phase === 'roundEnd') {
    match.phaseT += dt;
    if (match.phaseT >= 4.5) {
      if (match.atkWins >= WIN_ROUNDS || match.defWins >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
        endMatch();
      } else {
        match.round += 1;
        startBuyPhase();
      }
    }
  }

  // player movement + actions
  if (you.alive && (match.phase === 'live' || match.phase === 'buy')) {
    player.step(dt, input.state.keys);
    // footsteps
    if (player.groundSpeed() > 1.5 && elapsed - you.stepAt > 0.36) {
      you.stepAt = elapsed;
      audio.step();
      // running footsteps are audible: the nearest idle defender investigates
      bots.heardStep(player.state.position, 'attack');
    }
  }
  weapon.step(dt);

  // bots hold at spawn during the buy phase (freeze time) — they only play
  if (match.phase === 'live') bots.step(dt);
  effects.step(dt);
  grenades.step(dt);

  // bot channel warnings (enemy planting / defusing)
  let warn = null;
  for (const [bot, ch] of botChannels) {
    if (ch.kind === 'plant') warn = `⚠ ${bot.name} IS PLANTING AT ${ch.site} — ${Math.ceil((1 - ch.progress) * 3)}s`;
    if (ch.kind === 'defuse') warn = `⚠ ${bot.name} IS DEFUSING AT ${ch.site} — ${Math.ceil((1 - ch.progress) * 5)}s`;
  }
  if (warn) hud.setPrompt(warn);

  // player plant channel
  if (you.alive && match.phase === 'live' && !match.plantedSite) {
    const site = nearestSite();
    if (site && input.state.keys.has('KeyE')) {
      you.planting = true;
      you.plantProgress += dt / 3;
      hud.setChannel('PLANTING CHARGE — HOLD E', you.plantProgress);
      if (you.plantProgress >= 1) {
        you.plantProgress = 0;
        you.planting = false;
        hud.setChannel(null);
        plantCharge(site, 'YOU');
      }
    } else {
      if (you.planting) {
        you.planting = false;
        you.plantProgress = 0;
        hud.setChannel(null);
      }
      if (site && !warn) hud.setPrompt('HOLD E — PLANT CHARGE');
      else if (!warn) hud.setPrompt('');
    }
  }

  // minimap at ~10 Hz
  if (Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) {
    hud.drawMinimap(player.state.position, player.state.yaw, bots.bots, match.plantedSite);
    hud.setAlive(bots.aliveCount('attack') + (you.alive ? 1 : 0), bots.aliveCount('defend'));
  }

  // crosshair spread follows movement + heat
  const spreadPx = 4 + weapon.spread(player.groundSpeed(), player.state.crouching) * 900;
  hud.setCrosshairSpread(spreadPx);
}

function nearestSite() {
  const p = player.state.position;
  for (const key of ['A', 'B']) {
    const s = world.sites[key];
    if (Math.hypot(p.x - s.x, p.z - s.z) < 2.6) return key;
  }
  return null;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (you.alive && (match.phase === 'live' || match.phase === 'buy')) player.look(look.x, look.y);
    if (input.state.firing && you.alive && match.phase === 'live') {
      if (you.selectedGrenade) {
        // a grenade is selected: click throws it (0.8 s between throws)
        if (elapsed - you.throwAt > 0.8) throwPlayerGrenade();
      } else if (weapon.ready()) {
        if (weapon.def.auto || elapsed - you.firedAt > 0.25) playerShoot();
      }
    }
    if (input.state.keys.has('KeyR') && you.alive) weapon.reload();
    if (input.state.keys.has('Digit1') && you.alive && match.phase === 'live') {
      weapon.equip('pistol');
      you.selectedGrenade = null;
      hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
    }
    if (input.state.keys.has('Digit2') && you.alive && match.phase === 'live' && you.hasPrimary) {
      weapon.equip(you.primary);
      you.selectedGrenade = null;
      hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
    }
    if (input.state.keys.has('Digit4') && you.alive && match.phase === 'live' && you.grenades.he > 0) {
      you.selectedGrenade = 'he';
      hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
    }
    if (input.state.keys.has('Digit5') && you.alive && match.phase === 'live' && you.grenades.smoke > 0) {
      you.selectedGrenade = 'smoke';
      hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
    }
    if (input.state.keys.has('Digit6') && you.alive && match.phase === 'live' && you.grenades.flash > 0) {
      you.selectedGrenade = 'flash';
      hud.setGrenades(you.grenades.he, you.grenades.smoke, you.grenades.flash, you.selectedGrenade);
    }
    if (input.state.keys.has('KeyB') && match.phase === 'buy') {
      if (hud.isBuyOpen()) { hud.closeBuy(); hud.setPrompt(''); }
      else hud.openBuy(you.money, squadList());
    }
    if (input.state.keys.has('Enter') && match.phase === 'buy') {
      hud.closeBuy();
      hud.setPrompt('');
      startRound();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// ---- deterministic screenshot frames ----
function runShot(name) {
  hud.hideOverlay();
  hud.closeBuy();
  resetMatchStateForShot();
  if (name === 'start') {
    // buy phase, spawn, looking down mid, buy menu open, teammates beside you
    match.phase = 'buy';
    match.phaseT = 2;
    player.state.position.set(0, 0, 15.5);
    player.state.yaw = 0;
    player.state.pitch = 0;
    settle(30);
    hud.openBuy(you.money, squadList());
    hud.setMoney(you.money);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS - 2, false);
    hud.setHealth(100, 0);
    hud.setAmmo(30, 90, 'KR-77 LONGSHOT');
    hud.setAlive(5, 5);
  } else if (name === 'play') {
    // mid-round firefight: player aiming down mid at an enemy, tracer in the air
    match.phase = 'live';
    match.phaseT = 17;
    match.round = 2;
    match.atkWins = 1;
    player.state.position.set(1.2, 0, 11);
    player.state.yaw = 0;
    player.state.pitch = -0.028;
    settle(20);
    const enemy = bots.bots.find((b) => b.team === 'defend' && b.name === 'ONNO');
    if (enemy) {
      enemy.mover.state.position.set(1.2, 0, -0.5);
      enemy.group.position.set(1.2, 0, -0.5);
      enemy.mover.state.yaw = Math.PI;
      enemy.group.rotation.y = 0;
    }
    const enemy2 = bots.bots.find((b) => b.team === 'defend' && b.name === 'SABLE');
    if (enemy2) {
      enemy2.mover.state.position.set(-3.5, 0, -0.5);
      enemy2.group.position.set(-3.5, 0, -0.5);
      enemy2.mover.state.yaw = -2.78;
      enemy2.group.rotation.y = -2.78;
    }
    const mate = bots.bots.find((b) => b.team === 'attack' && b.name === 'MARA');
    if (mate) {
      mate.mover.state.position.set(3.8, 0, 6.5);
      mate.group.position.set(3.8, 0, 6.5);
      mate.mover.state.yaw = 0;
      mate.group.rotation.y = Math.PI;
    }
    settle(10);
    // one shot fired at the enemy for the tracer + muzzle flash
    camera.getWorldDirection(direction);
    direction.normalize();
    scene.updateMatrixWorld(true);
    shoot(camera.position, direction, weapon.def, 'player');
    weapon.pullTrigger();
    weapon.state.mag = 24;
    hud.setAmmo(24, 90, 'KR-77 LONGSHOT');
    hud.setHealth(100, 0);
    hud.setMoney(2300);
    hud.setScore(1, 0, 2);
    hud.setTimer(83, false);
    hud.setAlive(5, 4);
    hud.hitMarker(false);
    hud.radio('MARA', 'Contact Mid — two pushing', 'attack');
    hud.radio('SABLE', 'Heard a shot, Mid', 'defend');
  } else if (name === 'smoke') {
    // grenade frame: a smoke screen blooming at the warehouse entrance (site B),
    match.phase = 'live';
    match.phaseT = 25;
    match.round = 2;
    match.atkWins = 1;
    player.state.position.set(4, 0, 2);
    player.state.yaw = -0.66; // facing site B / the warehouse
    player.state.pitch = 0.01;
    settle(20);
    you.grenades = { he: 1, smoke: 1, flash: 0 };
    you.selectedGrenade = 'smoke';
    const eye = new THREE.Vector3(4, 1.6, 2);
    grenades.throwArc('smoke', eye, new THREE.Vector3(14, 1, -6.5), 'attack', 'YOU');
    you.grenades.smoke = 0;
    you.selectedGrenade = null;
    settle(75); // flight ~0.9 s + pop + cloud swell
    const guard = bots.bots.find((b) => b.team === 'defend' && b.name === 'DARA');
    if (guard) {
      guard.mover.state.position.set(12.5, 0, -8);
      guard.group.position.set(12.5, 0, -8);
      guard.mover.state.yaw = 2.4;
      guard.group.rotation.y = 2.4;
    }
    const mate = bots.bots.find((b) => b.team === 'attack' && b.name === 'MARA');
    if (mate) {
      mate.mover.state.position.set(7, 0, 0.5);
      mate.group.position.set(7, 0, 0.5);
      mate.mover.state.yaw = -0.6;
      mate.group.rotation.y = -0.6;
    }
    hud.setAmmo(30, 90, 'KR-77 LONGSHOT');
    hud.setHealth(100, 0);
    hud.setMoney(2300);
    hud.setScore(1, 0, 2);
    hud.setTimer(75, false);
    hud.setAlive(5, 5);
    hud.setGrenades(1, 0, 0, null);
  } else if (name === 'catwalk') {
    // v3 multi-level frame: the player stands on the west catwalk (2.6 m up)
    match.phase = 'live';
    match.phaseT = 31;
    match.round = 2;
    match.atkWins = 1;
    player.state.position.set(-7, 2.6, -4.4);
    player.state.velocity.set(0, 0, 0);
    player.state.yaw = 0;
    player.state.pitch = -0.12;
    settle(20);
    const flank = bots.bots.find((b) => b.team === 'attack' && b.name === 'VESK');
    if (flank) {
      flank.mover.state.position.set(-7, 2.6, -7.6);
      flank.group.position.set(-7, 2.6, -7.6);
      flank.mover.state.yaw = 0;
      flank.group.rotation.y = 0;
    }
    const mate = bots.bots.find((b) => b.team === 'attack' && b.name === 'MARA');
    if (mate) {
      mate.mover.state.position.set(-7, 2.6, 1.0);
      mate.group.position.set(-7, 2.6, 1.0);
      mate.mover.state.yaw = 0;
      mate.group.rotation.y = Math.PI;
    }
    const holder = bots.bots.find((b) => b.team === 'defend' && b.name === 'DARA');
    if (holder) {
      holder.mover.state.position.set(-13, 0, -10);
      holder.group.position.set(-13, 0, -10);
      holder.mover.state.yaw = 2.4;
      holder.group.rotation.y = 2.4;
    }
    settle(10);
    camera.getWorldDirection(direction);
    direction.normalize();
    scene.updateMatrixWorld(true);
    shoot(camera.position, direction, weapon.def, 'player');
    weapon.pullTrigger();
    weapon.state.mag = 24;
    hud.setAmmo(24, 90, 'KR-77 LONGSHOT');
    hud.setHealth(100, 0);
    hud.setMoney(2300);
    hud.setScore(1, 0, 2);
    hud.setTimer(69, false);
    hud.setAlive(5, 5);
    hud.hitMarker(false);
    hud.radio('VESK', 'Flanking B — catwalk clear', 'attack');
  } else if (name === 'retake') {
    // v3 retake frame: charge planted at B, lead retaker RUE pushing the front
    match.phase = 'live';
    match.phaseT = 40;
    match.round = 3;
    match.atkWins = 1;
    match.defWins = 1;
    match.plantedSite = 'B';
    match.detonateT = 25;
    player.state.position.set(8, 0, -1);
    player.state.velocity.set(0, 0, 0);
    player.state.yaw = -0.5;
    player.state.pitch = 0.02;
    settle(20);
    you.grenades = { he: 0, smoke: 1, flash: 0 };
    const eye = new THREE.Vector3(8, 1.6, -1);
    grenades.throwArc('smoke', eye, new THREE.Vector3(14, 1, -11), 'defend', 'RUE');
    you.grenades.smoke = 0;
    settle(75);
    const lead = bots.bots.find((b) => b.team === 'defend' && b.name === 'RUE');
    if (lead) {
      lead.mover.state.position.set(13, 0, -6.5);
      lead.group.position.set(13, 0, -6.5);
      lead.mover.state.yaw = 0;
      lead.group.rotation.y = 0;
    }
    const flankR = bots.bots.find((b) => b.team === 'defend' && b.name === 'FINN');
    if (flankR) {
      flankR.mover.state.position.set(5.5, 2.6, -6);
      flankR.group.position.set(5.5, 2.6, -6);
      flankR.mover.state.yaw = -0.5;
      flankR.group.rotation.y = -0.5;
    }
    const carrier = bots.bots.find((b) => b.team === 'attack' && b.name === 'KIP');
    if (carrier) {
      carrier.mover.state.position.set(16, 0, -12);
      carrier.group.position.set(16, 0, -12);
      carrier.mover.state.yaw = 2.6;
      carrier.group.rotation.y = 2.6;
    }
    hud.setAmmo(18, 90, 'KR-77 LONGSHOT');
    hud.setHealth(64, 25);
    hud.setMoney(2900);
    hud.setScore(1, 1, 3);
    hud.setTimer(25, true);
    hud.setAlive(4, 4);
    hud.showBanner('CHARGE PLANTED', 'RUE is retaking SITE B — WALL OF SMOKE', 60000);
    hud.setGrenades(0, 0, 0, null);
    hud.radio('RUE', 'Retaking B — smoke out', 'defend');
    hud.radio('FINN', 'Flanking from the east catwalk', 'defend');
  } else {
    // round won: charge detonated at A, banner up, score 2-1
    match.phase = 'roundEnd';
    match.phaseT = 0.6;
    match.round = 3;
    match.atkWins = 2;
    match.defWins = 1;
    match.plantedSite = 'A';
    player.state.position.set(-6, 0, -4);
    player.state.yaw = 0.98;
    player.state.pitch = 0.02;
    settle(20);
    you.health = 64;
    you.armor = 25;
    weapon.state.mag = 18;
    hud.setAmmo(18, 90, 'KR-77 LONGSHOT');
    hud.setHealth(64, 25);
    hud.setMoney(5550);
    hud.setScore(2, 1, 3);
    hud.setTimer(0, true);
    hud.setAlive(3, 0);
    hud.showBanner('TIDE RUNNERS TAKE THE ROUND', 'Charge detonated at SITE A — CRANE YARD', 60000);
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  paintTwiceThenReady();
}

function resetMatchStateForShot() {
  match.round = 1;
  match.atkWins = 0;
  match.defWins = 0;
  match.lossStreak = 0;
  match.plantedSite = null;
  you.money = 800;
  you.primary = 'rifle';
  you.hasPrimary = true;
  you.armor = 0;
  you.helmet = false;
  you.health = 100;
  you.alive = true;
  you.grenades = { he: 0, smoke: 0, flash: 0 };
  you.selectedGrenade = null;
  weapon.equip('rifle');
  weapon.refill();
  bots.reset(1);
  grenades.clear();
  hud.clearOwned();
  hud.setMoney(you.money);
}

// Debug hook: live state for testing and for the finalist review team.
window.__tidewater = { world, match, you, bots, player, weapon, grenades, step, startRound, startBuyPhase };

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
hud.setHealth(100, 0);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS, false);
hud.setAlive(5, 5);
hud.setGrenades(0, 0, 0, null);
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
