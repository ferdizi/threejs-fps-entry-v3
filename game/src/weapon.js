// Weapons: five original guns, one economy. Accuracy is the skill: spread grows with
// movement and sustained fire, crouching and standing still are rewarded, headshots x4.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', price: 0, damage: 34, headMult: 4, mag: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.3, spreadStill: 0.004, spreadMove: 0.02, auto: false,
    kick: 0.006, range: 45, moveSpeed: 1.0, desc: 'Reliable sidearm. Free, always yours.',
  },
  smg: {
    id: 'smg', name: 'VEX-9', price: 1500, damage: 26, headMult: 4, mag: 30, reserve: 120,
    fireGap: 0.075, reloadTime: 1.7, spreadStill: 0.006, spreadMove: 0.03, auto: true,
    kick: 0.004, range: 38, moveSpeed: 1.04, desc: 'Fast close-quarters spray. Runs while you run.',
  },
  rifle: {
    id: 'rifle', name: 'KR-77 LONGSHOT', price: 2700, damage: 33, headMult: 4, mag: 30, reserve: 90,
    fireGap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true,
    kick: 0.009, range: 70, moveSpeed: 0.96, desc: 'The workhorse. Deadly when you stand and aim.',
  },
  shotgun: {
    id: 'shotgun', name: 'BREAKER-12', price: 2100, damage: 9, headMult: 2, mag: 6, reserve: 24,
    fireGap: 0.85, reloadTime: 2.4, spreadStill: 0.045, spreadMove: 0.06, auto: false, pellets: 8,
    kick: 0.03, range: 22, moveSpeed: 0.97, desc: 'Eight pellets, one hallway. Devastating up close.',
  },
  sniper: {
    id: 'sniper', name: 'HARBOR MK.IV', price: 4750, damage: 115, headMult: 4, mag: 5, reserve: 15,
    fireGap: 1.1, reloadTime: 2.8, spreadStill: 0.0004, spreadMove: 0.09, auto: false,
    kick: 0.05, range: 120, moveSpeed: 0.9, desc: 'One shot, one harbour. Punishes moving.',
  },
};
export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 100;

// Realistic viewmodels — top-LB study 2026-11-16 (rank 2 Lantern Rock pistol,
// rank 3 CAMPANILE rifle): the guns that read as REAL all show a HAND +
// FOREARM holding the weapon, a ROUND barrel, warm wood furniture against
// dark gunmetal, and the barrel canted up toward the crosshair. Boxes alone
// read as a floating slab. The hand and the round barrel are what make the
// brain accept it as a weapon.
function std(color, roughness, metalness, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness, ...extra });
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  return m;
}
function cyl(rTop, rBottom, len, mat, x = 0, y = 0, z = 0, seg = 12, rx = Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, seg), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

function buildViewModel(def) {
  // Lit materials on purpose: MeshBasicMaterial ignores lights entirely, so
  // the vmLight added in createWeapon() had zero effect on the gun (the
  // 2026-11-16 "dark silhouette" fix). Standard materials let vmLight work.
  const metal = std('#2f3338', 0.38, 0.65);
  const metalLight = std('#4a5058', 0.45, 0.5);
  const dark = std('#1d2023', 0.5, 0.4);
  const wood = std('#7a5a38', 0.75, 0.05);
  const woodDark = std('#5d4126', 0.8, 0.05);
  const skin = std('#c98f66', 0.7, 0);
  const sleeve = std('#2e3a4d', 0.85, 0);
  const accent = std(PALETTE.accent, 0.5, 0.1, { emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4 });
  const glass = std('#9fd8e8', 0.15, 0.1, { emissive: new THREE.Color('#3a6a7a'), emissiveIntensity: 0.5 });
  const model = new THREE.Group();
  // Inner group carries the permanent cant: barrel rises toward the
  // crosshair like a real held rifle. step() only touches the OUTER group's
  // rotation.x / position.z, so this tilt survives recoil and reload.
  const inner = new THREE.Group();
  inner.rotation.x = 0.07;
  inner.rotation.z = -0.07;
  model.add(inner);

  // Hand + forearm: the hand wraps the pistol grip; the forearm runs down
  // out of the frame, sleeve cuff at the bottom edge (like CAMPANILE).
  function handAndArm(gx, gy, gz, grx) {
    const g = new THREE.Group();
    g.position.set(gx, gy, gz);
    g.rotation.x = grx;
    g.add(box(0.06, 0.1, 0.08, skin, 0, 0, 0)); // fist around the grip
    g.add(box(0.02, 0.05, 0.025, skin, 0.032, 0.01, -0.01, 0, 0.4)); // thumb
    g.add(cyl(0.042, 0.055, 0.42, skin, 0.01, -0.32, 0.14, 10, -0.47)); // forearm
    g.add(cyl(0.058, 0.062, 0.16, sleeve, 0.015, -0.5, 0.24, 10, -0.47)); // cuff
    return g;
  }
  // Curved box magazine: two segments along an arc, like a real rifle mag.
  function curvedMag(x, y, z) {
    const g = new THREE.Group();
    g.add(box(0.045, 0.12, 0.07, metal, x, y, z, 0.12));
    g.add(box(0.045, 0.1, 0.07, metal, x, y - 0.085, z + 0.03, 0.32));
    g.add(box(0.05, 0.02, 0.08, accent, x, y - 0.135, z + 0.045, 0.32));
    return g;
  }

  if (def.id === 'pistol') {
    inner.add(box(0.055, 0.06, 0.26, metalLight, 0, 0.01, -0.02)); // slide
    inner.add(box(0.05, 0.012, 0.2, dark, 0, 0.044, -0.02)); // slide top flat
    inner.add(cyl(0.018, 0.018, 0.03, dark, 0, 0.01, -0.16, 10)); // muzzle
    inner.add(box(0.01, 0.025, 0.01, dark, -0.015, 0.055, 0.08)); // rear sight
    inner.add(box(0.01, 0.025, 0.01, dark, 0.015, 0.055, 0.08));
    inner.add(box(0.008, 0.018, 0.008, accent, 0, 0.052, -0.13)); // front sight
    inner.add(box(0.05, 0.15, 0.075, woodDark, 0, -0.1, 0.09, 0.25)); // grip
    inner.add(handAndArm(0, -0.1, 0.09, 0.25));
  } else if (def.id === 'smg') {
    inner.add(box(0.08, 0.09, 0.34, metalLight, 0, 0, 0.02)); // receiver
    inner.add(cyl(0.02, 0.02, 0.28, metal, 0, 0.02, -0.3, 12)); // round barrel
    inner.add(cyl(0.028, 0.028, 0.05, dark, 0, 0.02, -0.44, 12)); // muzzle
    inner.add(box(0.07, 0.07, 0.18, wood, 0, 0, -0.2)); // handguard
    inner.add(box(0.06, 0.07, 0.12, metal, 0, -0.01, 0.22)); // stock
    inner.add(box(0.05, 0.12, 0.06, woodDark, 0, -0.105, 0.08, 0.3)); // grip
    inner.add(curvedMag(0, -0.06, -0.08));
    inner.add(handAndArm(0, -0.105, 0.08, 0.3));
  } else if (def.id === 'shotgun') {
    inner.add(box(0.09, 0.1, 0.4, metalLight, 0, 0, 0)); // receiver
    inner.add(cyl(0.03, 0.03, 0.44, metal, 0, 0.02, -0.38, 12)); // barrel
    inner.add(cyl(0.025, 0.025, 0.4, metal, 0, -0.045, -0.36, 10)); // mag tube
    inner.add(box(0.085, 0.075, 0.15, wood, 0, -0.05, -0.3)); // pump
    inner.add(box(0.07, 0.09, 0.24, wood, 0, -0.035, 0.3, -0.1)); // stock
    inner.add(box(0.075, 0.1, 0.03, dark, 0, -0.06, 0.42, -0.1)); // butt pad
    inner.add(box(0.008, 0.02, 0.008, accent, 0, 0.055, -0.58)); // bead sight
    inner.add(box(0.05, 0.12, 0.06, woodDark, 0, -0.105, 0.08, 0.3)); // grip
    inner.add(handAndArm(0, -0.05, -0.3, 0)); // forward hand on the pump
  } else if (def.id === 'sniper') {
    inner.add(box(0.08, 0.09, 0.46, metalLight, 0, 0, 0)); // receiver
    inner.add(cyl(0.02, 0.024, 0.52, metal, 0, 0.02, -0.45, 12)); // long barrel
    inner.add(cyl(0.028, 0.028, 0.06, dark, 0, 0.02, -0.7, 12)); // muzzle
    inner.add(cyl(0.032, 0.032, 0.22, dark, 0, 0.08, 0, 12)); // scope tube
    inner.add(cyl(0.028, 0.028, 0.006, glass, 0, 0.08, -0.11, 12)); // front glass
    inner.add(cyl(0.028, 0.028, 0.006, glass, 0, 0.08, 0.11, 12)); // rear glass
    inner.add(box(0.02, 0.04, 0.03, metal, 0, 0.05, -0.06)); // scope mounts
    inner.add(box(0.02, 0.04, 0.03, metal, 0, 0.05, 0.06));
    inner.add(box(0.07, 0.09, 0.26, wood, 0, -0.035, 0.32, -0.1)); // stock
    inner.add(box(0.05, 0.12, 0.06, woodDark, 0, -0.105, 0.08, 0.3)); // grip
    inner.add(box(0.05, 0.02, 0.02, metalLight, 0.055, 0.02, 0.08)); // bolt handle
    inner.add(handAndArm(0, -0.105, 0.08, 0.3));
  } else {
    // KR-77 LONGSHOT rifle — the showcase weapon in all 4 screenshots.
    inner.add(box(0.09, 0.1, 0.4, metalLight, 0, 0, 0)); // receiver
    inner.add(box(0.05, 0.015, 0.34, metal, 0, 0.056, -0.02)); // top rail
    for (let i = 0; i < 4; i++) inner.add(box(0.052, 0.008, 0.02, dark, 0, 0.066, -0.14 + i * 0.08)); // rail ridges
    inner.add(box(0.01, 0.02, 0.01, dark, -0.015, 0.068, 0.14)); // rear sight posts
    inner.add(box(0.01, 0.02, 0.01, dark, 0.015, 0.068, 0.14));
    inner.add(box(0.04, 0.006, 0.01, dark, 0, 0.08, 0.14)); // rear sight bar
    inner.add(cyl(0.022, 0.022, 0.42, metal, 0, 0.02, -0.4, 12)); // ROUND barrel
    inner.add(cyl(0.033, 0.033, 0.08, metalLight, 0, 0.02, -0.6, 12)); // muzzle brake
    inner.add(cyl(0.035, 0.035, 0.008, dark, 0, 0.02, -0.58, 12)); // brake grooves
    inner.add(cyl(0.035, 0.035, 0.008, dark, 0, 0.02, -0.62, 12));
    inner.add(cyl(0.048, 0.048, 0.3, metal, 0, 0.01, -0.32, 8)); // octagonal dark handguard
    inner.add(cyl(0.051, 0.051, 0.015, metalLight, 0, 0.01, -0.2, 8)); // handguard bands
    inner.add(cyl(0.051, 0.051, 0.015, metalLight, 0, 0.01, -0.44, 8));
    inner.add(cyl(0.008, 0.008, 0.035, dark, 0, 0.065, -0.46, 6)); // front sight post
    inner.add(box(0.01, 0.025, 0.01, dark, -0.02, 0.06, -0.46)); // front sight wings
    inner.add(box(0.01, 0.025, 0.01, dark, 0.02, 0.06, -0.46));
    inner.add(box(0.07, 0.09, 0.24, wood, 0, -0.035, 0.3, -0.1)); // wood stock
    inner.add(box(0.075, 0.1, 0.03, dark, 0, -0.06, 0.42, -0.1)); // butt pad
    inner.add(box(0.05, 0.13, 0.06, woodDark, 0, -0.11, 0.06, 0.35)); // pistol grip
    inner.add(curvedMag(0, -0.06, -0.06)); // curved magazine
    inner.add(box(0.012, 0.04, 0.015, dark, 0, -0.065, -0.01, 0.2)); // trigger
    inner.add(box(0.02, 0.02, 0.05, metalLight, 0.052, 0.01, 0.06)); // charging handle
    inner.add(box(0.004, 0.03, 0.09, dark, 0.046, 0.02, -0.06)); // ejection port
    inner.add(handAndArm(0, -0.11, 0.06, 0.35)); // hand + forearm on the grip
  }
  model.position.set(0.26, -0.2, -0.62);
  model.scale.set(1.25, 1.25, 1.25);
  // The viewmodel rides on the camera itself, so Three.js frustum culling
  // can wrongly discard it (its world-space bounds sit inside the camera).
  // Never cull the viewmodel — it must always be visible.
  model.traverse((o) => { o.frustumCulled = false; });
  return model;
}

export function createWeapon(camera) {
  let def = WEAPONS.rifle;
  let model = buildViewModel(def);
  camera.add(model);

  // Dedicated light for the viewmodel so the gun is always clearly visible,
  // even when the player stands in shadow. Short range so it barely touches the scene.
  const vmLight = new THREE.PointLight(new THREE.Color('#fff2dd'), 2.5, 3.0, 1.0);
  vmLight.position.set(0.1, 0.15, -0.35);
  camera.add(vmLight);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sun), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.18, -1.5);
  flash.visible = false;
  flash.frustumCulled = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.27, -0.18, -1.55);
  camera.add(flashLight);

  const state = {
    mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    heat: 0, // sustained-fire bloom, decays when not firing
  };

  function equip(id, keepAmmo = false) {
    def = WEAPONS[id];
    camera.remove(model);
    model = buildViewModel(def);
    camera.add(model);
    if (!keepAmmo) {
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.heat = 0;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.7 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = Math.random() * 0.6;
    flashLight.intensity = state.flash > 0 ? 8 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() { return def; },
    equip,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.02 + def.kick;
      state.heat = Math.min(1, state.heat + (def.id === 'smg' ? 0.09 : def.id === 'rifle' ? 0.07 : 0.02));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed, crouching) {
      const move = Math.min(1, speed / 5.2);
      let s = def.spreadStill + move * def.spreadMove + state.heat * 0.012;
      if (crouching) s *= 0.7;
      return s;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
    },
  };
}
