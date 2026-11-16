// Combat effects: tracers, muzzle flashes for bots, impact sparks and hit puffs.
// Pooled, so a firefight never allocates.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), transparent: true, opacity: 0.55 });
  for (let i = 0; i < 24; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(48 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95 });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.visible = false;
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparkVel = [];
  let sparkLife = 0;

  const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const flashes = [];
  for (let i = 0; i < 9; i += 1) {
    const mesh = new THREE.Mesh(flashGeo, flashMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    flashes.push({ mesh, life: 0 });
  }

  // HE blast: a pooled fireball sphere that swells and fades, plus a spark burst.
  const blasts = [];
  const blastGeo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    blasts.push({ mesh, life: 0 });
  }

  function explosion(point) {
    const b = blasts.find((x) => x.life <= 0);
    if (b) {
      b.mesh.position.copy(point).add(new THREE.Vector3(0, 0.6, 0));
      b.mesh.scale.setScalar(0.4);
      b.mesh.visible = true;
      b.life = 0.45;
    }
    // a wide spark burst from the same point (reuses the spark pool)
    sparkPoints.position.copy(point).add(new THREE.Vector3(0, 0.6, 0));
    for (let i = 0; i < 48; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 6;
      sparkVel[i] = new THREE.Vector3(Math.cos(a) * r, 1 + Math.random() * 5, Math.sin(a) * r);
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y + 0.6;
      sparkPos[i * 3 + 2] = point.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkPoints.visible = true;
    sparkLife = 0.5;
  }

  // Smoke clouds: 3 pooled clouds x 12 puffs. Each puff grows, drifts and fades
  // over the cloud's 18 s life. The occlusion logic lives in grenade.js; this is
  // only the visual.
  const smokeClouds = [];
  const puffGeo = new THREE.SphereGeometry(0.55, 10, 8);
  for (let c = 0; c < 3; c += 1) {
    const puffs = [];
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#9aa5ab'), transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      scene.add(mesh);
      puffs.push({ mesh, vel: new THREE.Vector3(), grow: 1 });
    }
    smokeClouds.push({ puffs, life: 0 });
  }

  function smoke(point) {
    const c = smokeClouds.find((x) => x.life <= 0);
    if (!c) return;
    c.life = 18;
    for (const p of c.puffs) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;
      p.mesh.position.set(point.x + Math.cos(a) * r, 0.4 + Math.random() * 1.9, point.z + Math.sin(a) * r);
      p.vel.set((Math.random() * 2 - 1) * 0.25, 0.05 + Math.random() * 0.12, (Math.random() * 2 - 1) * 0.25);
      p.grow = 0.7 + Math.random() * 0.9;
      p.mesh.scale.setScalar(0.5);
      p.mesh.visible = true;
    }
  }

  // Impact dust: grey, slow, heavy puffs for bullet hits and muzzle smoke.
  // A second Points pool next to the orange sparks (which stay for explosions).
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(48 * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: new THREE.Color('#8a939a'), size: 0.14, transparent: true, opacity: 0.8 });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.visible = false;
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
  const dustVel = [];
  let dustLife = 0;

  function dust(point) {
    dustPoints.position.copy(point);
    for (let i = 0; i < 48; i += 1) {
      dustVel[i] = new THREE.Vector3(
        (Math.random() * 2 - 1) * 1.1,
        Math.random() * 1.4 + 0.2,
        (Math.random() * 2 - 1) * 1.1,
      );
      dustPos[i * 3] = point.x;
      dustPos[i * 3 + 1] = point.y;
      dustPos[i * 3 + 2] = point.z;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustPoints.visible = true;
    dustLife = 0.55;
  }

  function tracer(from, to) {
    const t = tracers.find((x) => x.life <= 0);
    if (!t) return;
    // start the bolt a little ahead of the muzzle: a tracer that begins inside
    // the camera reads as a giant triangle, not a line.
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const start = from.clone().addScaledVector(dir, 0.6);
    const mid = start.clone().add(to).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, Math.max(0.1, len - 0.6));
    t.mesh.visible = true;
    t.life = 0.12;
  }

  function impact(point, normal) {
    sparkPoints.position.copy(point).add(normal.clone().multiplyScalar(0.05));
    for (let i = 0; i < 48; i += 1) {
      sparkVel[i] = new THREE.Vector3(
        (Math.random() * 2 - 1) * 2.4 + normal.x * 2,
        Math.random() * 2.6 + 0.6,
        (Math.random() * 2 - 1) * 2.4 + normal.z * 2,
      );
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkPoints.visible = true;
    sparkLife = 0.28;
  }

  function muzzle(point, dir) {
    const f = flashes.find((x) => x.life <= 0);
    if (!f) return;
    f.mesh.position.copy(point);
    f.mesh.lookAt(point.clone().add(dir));
    f.mesh.rotation.z = Math.random() * Math.PI;
    f.mesh.visible = true;
    f.life = 0.06;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.55;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const f of flashes) {
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) f.mesh.visible = false;
      }
    }
    if (sparkLife > 0) {
      sparkLife -= dt;
      for (let i = 0; i < 48; i += 1) {
        sparkVel[i].y -= 9 * dt;
        sparkPos[i * 3] += sparkVel[i].x * dt;
        sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
        sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = Math.max(0, sparkLife / 0.28) * 0.95;
      if (sparkLife <= 0) sparkPoints.visible = false;
    }
    for (const b of blasts) {
      if (b.life > 0) {
        b.life -= dt;
        const k = 1 - b.life / 0.45;
        b.mesh.scale.setScalar(0.4 + k * 4.6);
        b.mesh.material.opacity = Math.max(0, (b.life / 0.45) * 0.85);
        if (b.life <= 0) b.mesh.visible = false;
      }
    }
    for (const c of smokeClouds) {
      if (c.life > 0) {
        c.life -= dt;
        const age = 18 - c.life;
        const growK = Math.min(1, age / 1.2); // swell in the first ~1.2 s
        const fade = c.life < 4 ? c.life / 4 : 1; // fade out in the last 4 s
        for (const p of c.puffs) {
          p.mesh.position.x += p.vel.x * dt;
          p.mesh.position.y += p.vel.y * dt;
          p.mesh.position.z += p.vel.z * dt;
          p.mesh.scale.setScalar((0.5 + growK * p.grow) * (1 + age * 0.02));
          p.mesh.material.opacity = 0.5 * fade;
          if (c.life <= 0) p.mesh.visible = false;
        }
      }
    }
    if (dustLife > 0) {
      dustLife -= dt;
      for (let i = 0; i < 48; i += 1) {
        dustVel[i].y -= 2.5 * dt;
        dustPos[i * 3] += dustVel[i].x * dt;
        dustPos[i * 3 + 1] += dustVel[i].y * dt;
        dustPos[i * 3 + 2] += dustVel[i].z * dt;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustMat.opacity = Math.max(0, dustLife / 0.55) * 0.8;
      if (dustLife <= 0) dustPoints.visible = false;
    }
  }

  return { tracer, impact, muzzle, explosion, smoke, dust, step };
}
