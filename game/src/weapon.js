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

function buildViewModel(def) {
  const grip = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3d434c') });
  const body = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7d8794') });
  const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.08), grip);
    handle.position.set(0, -0.09, 0.09);
    model.add(slide, handle);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.11, -0.05);
    model.add(receiver, barrel, mag);
  } else if (def.id === 'shotgun') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.4), body);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.44, 10), grip);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.03, -0.36);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.14), accent);
    pump.position.set(0, -0.06, -0.3);
    model.add(receiver, tube, pump);
  } else if (def.id === 'sniper') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.46), body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10), grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.44);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, 0.02);
    model.add(receiver, barrel, scope);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
    sight.position.set(0, 0.075, -0.05);
    model.add(receiver, barrel, stock, sight);
  }
  model.position.set(0.22, -0.2, -0.6);
  model.scale.set(1.6, 1.6, 1.6);
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
  flash.position.set(0.27, -0.16, -1.25);
  flash.visible = false;
  flash.frustumCulled = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.27, -0.16, -1.3);
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
