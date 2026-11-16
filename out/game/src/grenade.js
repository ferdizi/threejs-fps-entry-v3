// Grenades: HE + smoke, for the player and the bots. Criterion 3 names a grenade
import * as THREE from 'three';

export const GRENADES = {
  he: {
    id: 'he', name: 'HE GRENADE', price: 300, damage: 90, radius: 6,
    desc: 'High-explosive. 90 damage at the centre, falling off to the edge.',
  },
  smoke: {
    id: 'smoke', name: 'SMOKE GRENADE', price: 300, duration: 18, radius: 3.5,
    desc: 'Bursts into a smoke screen that blocks bot sight for 18 s.',
  },
  flash: {
    id: 'flash', name: 'FLASH GRENADE', price: 200, duration: 3, radius: 18,
    desc: 'Blinds anyone facing it for 3 s. Pop it round a corner.',
  },
};
export const GRENADE_MAX = 2; // per type, per player/bot
const GRAVITY = 12;
const HE_FUSE = 0.8;
const MAX_PROJECTILES = 6;

export function createGrenades(scene, world, api) {
  // api: { random, time, damageRadius(pos, radius, maxDmg, throwerTeam, throwerName),
  const projectiles = [];
  const clouds = [];
  const probe = new THREE.Box3();
  let thrown = 0;
  let heDetonations = 0;
  let smokePops = 0;
  let flashPops = 0;

  const meshMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < MAX_PROJECTILES; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), meshMat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    projectiles.push({ mesh, alive: false, kind: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), bounced: false, fuseT: 0, throwerTeam: null, throwerName: null });
  }

  function overlapsBox(x, y, z, half) {
    probe.min.set(x - half, y - half, z - half);
    probe.max.set(x + half, y + half, z + half);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function throwGrenade(kind, origin, vel, throwerTeam, throwerName) {
    const p = projectiles.find((x) => !x.alive);
    if (!p) return false;
    p.alive = true;
    p.kind = kind;
    p.pos.copy(origin);
    p.vel.copy(vel);
    p.bounced = false;
    p.fuseT = HE_FUSE;
    p.age = 0;
    p.throwerTeam = throwerTeam;
    p.throwerName = throwerName;
    p.mesh.visible = true;
    p.mesh.position.copy(origin);
    thrown += 1;
    return true;
  }

  // Throw on a ballistic arc that lands at `target` after `flightTime` seconds.
  function throwArc(kind, origin, target, throwerTeam, throwerName, flightTime = 0.9) {
    const t = flightTime;
    const vel = new THREE.Vector3(
      (target.x - origin.x) / t,
      (target.y - origin.y) / t + 0.5 * GRAVITY * t,
      (target.z - origin.z) / t,
    );
    return throwGrenade(kind, origin, vel, throwerTeam, throwerName);
  }

  function detonate(p) {
    p.alive = false;
    p.mesh.visible = false;
    heDetonations += 1;
    api.effects.explosion(p.pos);
    api.audio.explosion();
    api.damageRadius(p.pos, GRENADES.he.radius, GRENADES.he.damage, p.throwerTeam, p.throwerName);
  }

  function popSmoke(p) {
    p.alive = false;
    p.mesh.visible = false;
    smokePops += 1;
    const def = GRENADES.smoke;
    clouds.push({ x: p.pos.x, y: 1.2, z: p.pos.z, r: def.radius, t: 0, duration: def.duration });
    api.effects.smoke(p.pos);
    api.audio.hiss();
  }

  function popFlash(p) {
    p.alive = false;
    p.mesh.visible = false;
    flashPops += 1;
    if (api.onFlash) api.onFlash(p.pos);
  }

  function step(dt) {
    for (const p of projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      p.vel.y -= GRAVITY * dt;
      const nx = p.pos.x + p.vel.x * dt;
      const ny = p.pos.y + p.vel.y * dt;
      const nz = p.pos.z + p.vel.z * dt;
      let bounced = false;
      // ground plane (the yard itself is not a collider)
      if (ny < 0.09) {
        // dirt eats momentum: a grenade that hits the ground digs in and
        p.vel.y = Math.abs(p.vel.y) * 0.35;
        p.vel.x *= 0.3;
        p.vel.z *= 0.3;
        p.pos.x = nx;
        p.pos.y = 0.09;
        p.pos.z = nz;
        bounced = true;
      } else {
        // axis-by-axis collision: reflect the blocked axis, keep the others
        let hitX = false;
        let hitY = false;
        let hitZ = false;
        if (overlapsBox(nx, p.pos.y, p.pos.z, 0.09)) hitX = true;
        if (overlapsBox(p.pos.x, ny, p.pos.z, 0.09)) hitY = true;
        if (overlapsBox(p.pos.x, p.pos.y, nz, 0.09)) hitZ = true;
        if (hitX) { p.vel.x = -p.vel.x * 0.4; bounced = true; }
        else p.pos.x = nx;
        if (hitY) { p.vel.y = -p.vel.y * 0.4; bounced = true; }
        else p.pos.y = ny;
        if (hitZ) { p.vel.z = -p.vel.z * 0.4; bounced = true; }
        else p.pos.z = nz;
      }
      if (bounced && !p.bounced) {
        p.bounced = true;
        p.fuseT = HE_FUSE; // the HE fuse starts on the first bounce
      }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'flash' && p.bounced) {
        popFlash(p);
      } else if (p.kind === 'smoke' && p.bounced) {
        popSmoke(p);
      } else if (p.kind === 'he' && p.bounced) {
        p.fuseT -= dt;
        if (p.fuseT <= 0) detonate(p);
      } else if (!p.bounced && p.age > 2.5) {
        if (p.kind === 'he') detonate(p);
        else if (p.kind === 'flash') popFlash(p);
        else popSmoke(p);
      }
    }
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      clouds[i].t += dt;
      if (clouds[i].t >= clouds[i].duration) clouds.splice(i, 1);
    }
  }

  // Segment-vs-sphere: is the line of sight between two points cut by a smoke cloud?
  function segmentBlockedBySmoke(from, to) {
    for (const c of clouds) {
      const cx = c.x;
      const cy = c.y;
      const cz = c.z;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      let t = 0;
      if (lenSq > 0) {
        t = ((cx - from.x) * dx + (cy - from.y) * dy + (cz - from.z) * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const px = from.x + dx * t;
      const py = from.y + dy * t;
      const pz = from.z + dz * t;
      const dSq = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
      if (dSq < c.r * c.r) return true;
    }
    return false;
  }

  function clear() {
    for (const p of projectiles) {
      p.alive = false;
      p.mesh.visible = false;
    }
    clouds.length = 0;
  }

  return {
    throw: throwGrenade,
    throwArc,
    step,
    clear,
    segmentBlockedBySmoke,
    get clouds() { return clouds; },
    get stats() { return { thrown, heDetonations, smokePops, flashPops, clouds: clouds.length }; },
  };
}
