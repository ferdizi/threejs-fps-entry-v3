// TIDEWATER map: a container harbor at dawn. 44 x 36 m of playable ground.
// Two sites: A CRANE YARD (north-west) and B WAREHOUSE (north-east).
// Attackers spawn south, defenders north. Water and a dawn sky close the north side.
// v3: multi-level play. Two climbable container platforms (west at (-7,1), east at
// (5.5,3.2)) with 0.65 m stair steps, joined to the sites by catwalks at 2.6 m, plus
// a second ground route to B along the east wall. Stairs work because the shared
// mover auto-steps ledges up to 0.75 m (see player.js); containers (2.6 m) still block.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import {
  containerTexture, concreteTexture, asphaltTexture, metalTexture, waterTexture, skyTexture,
  hazardTexture, stencilTexture, corrugatedTexture,
} from './textures.js';

const CONTAINER_COLORS = ['#b5502e', '#2e6b8a', '#7a8c3f', '#8a6d2e', '#5b4a7a', '#a03a3a'];
const CONTAINER_CODES = ['TWDU 481209', 'TWDU 773120', 'TWDU 552810', 'TWDU 904311', 'TWDU 316745', 'TWDU 208834'];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mats = {
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(11), roughness: 0.95, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(7), roughness: 0.9, metalness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ map: metalTexture('#4a5a66', 3), roughness: 0.55, metalness: 0.55 }),
    steelDark: new THREE.MeshStandardMaterial({ map: metalTexture('#2c3841', 4), roughness: 0.6, metalness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9, metalness: 0 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x9c7a2e, roughness: 0.6, metalness: 0.4 }),
    barrelBlue: new THREE.MeshStandardMaterial({ color: 0x2e5a8a, roughness: 0.6, metalness: 0.4 }),
    water: new THREE.MeshStandardMaterial({ map: waterTexture(5), roughness: 0.25, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(13), roughness: 0.7, metalness: 0.2 }),
    corrugated: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#4a5a66', 19), roughness: 0.6, metalness: 0.45 }),
    stencilBay2: new THREE.MeshStandardMaterial({ map: stencilTexture('BAY 2', 17), roughness: 0.7, metalness: 0.3 }),
    stencilBay4: new THREE.MeshStandardMaterial({ map: stencilTexture('BAY 4', 23), roughness: 0.7, metalness: 0.3 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 1.6 }),
  };
  const containerMats = CONTAINER_COLORS.map((c, i) => new THREE.MeshStandardMaterial({
    map: containerTexture(c, CONTAINER_CODES[i], 20 + i), roughness: 0.75, metalness: 0.25,
  }));

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Visual-only mesh: seen and shot, but never collided with (rails, posts, chains).
  function deco(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // ---- ground: asphalt yard + concrete aprons at the sites ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 38), mats.asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);
  const apronA = new THREE.Mesh(new THREE.PlaneGeometry(13, 11), mats.concrete);
  apronA.rotation.x = -Math.PI / 2;
  apronA.position.set(-15, 0.01, -10);
  apronA.receiveShadow = true;
  group.add(apronA);
  const apronB = new THREE.Mesh(new THREE.PlaneGeometry(13, 11), mats.concrete);
  apronB.rotation.x = -Math.PI / 2;
  apronB.position.set(14, 0.01, -11);
  apronB.receiveShadow = true;
  group.add(apronB);

  // ---- perimeter walls (5 m) ----
  box(46, 5, 0.6, 0, 2.5, -18.3, mats.steelDark);
  box(46, 5, 0.6, 0, 2.5, 18.3, mats.steelDark);
  box(0.6, 5, 37.2, -22.3, 2.5, 0, mats.steelDark);
  box(0.6, 5, 37.2, 22.3, 2.5, 0, mats.steelDark);

  // ---- water + sky beyond the north fence ----
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 120), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, -78);
  group.add(water);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  sky.position.set(0, 0, 0);
  group.add(sky);

  // dawn sun disc low over the north-east water, plus two distant ships for depth
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 128;
  sunCanvas.height = 128;
  const sctx = sunCanvas.getContext('2d');
  const glow = sctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,225,170,1)');
  glow.addColorStop(0.3, 'rgba(255,180,100,0.75)');
  glow.addColorStop(1, 'rgba(255,160,80,0)');
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  sunTex.colorSpace = THREE.SRGBColorSpace;
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
  sunSprite.scale.set(46, 46, 1);
  sunSprite.position.set(72, 16, -128);
  group.add(sunSprite);
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x141c22, roughness: 0.9 });
  const ship1 = new THREE.Group();
  const hull1 = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 6), shipMat);
  hull1.position.y = 1.2;
  const stack1 = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 5), shipMat);
  stack1.position.set(-4, 5.5, 0);
  ship1.add(hull1, stack1);
  ship1.position.set(-52, -0.4, -52);
  group.add(ship1);
  const ship2 = new THREE.Group();
  const hull2 = new THREE.Mesh(new THREE.BoxGeometry(26, 3.4, 5), shipMat);
  hull2.position.y = 1;
  const stack2 = new THREE.Mesh(new THREE.BoxGeometry(8, 4.4, 4.4), shipMat);
  stack2.position.set(3, 4.6, 0);
  ship2.add(hull2, stack2);
  ship2.position.set(48, -0.4, -64);
  group.add(ship2);

  // ---- site A: CRANE YARD (north-west) — gantry crane + container stacks ----
  box(0.8, 11, 0.8, -19.5, 5.5, -13.5, mats.steelDark);
  box(0.8, 11, 0.8, -10.5, 5.5, -13.5, mats.steelDark);
  box(0.8, 11, 0.8, -19.5, 5.5, -6.5, mats.steelDark);
  box(0.8, 11, 0.8, -10.5, 5.5, -6.5, mats.steelDark);
  box(10.4, 1.1, 1.4, -15, 11.2, -10, mats.steel);
  box(2.2, 1.8, 2.0, -15, 10.2, -10, mats.barrel);
  box(0.9, 2.6, 0.9, -12.6, 9.2, -10, mats.steelDark);
  box(6.1, 2.6, 2.5, -18.5, 1.3, -8.2, containerMats[0]);
  box(6.1, 2.6, 2.5, -18.5, 3.9, -8.2, containerMats[1]);
  box(6.1, 2.6, 2.5, -8, 1.3, -15.6, containerMats[2]);
  box(2.5, 2.6, 6.1, -19.6, 1.3, -12.4, containerMats[3]);
  box(6.1, 2.6, 2.5, -17, 1.3, -5.6, containerMats[4]);
  box(1.2, 1.2, 1.2, -12.8, 0.6, -7.6, mats.wood);
  box(1.2, 1.2, 1.2, -12.8, 1.8, -7.6, mats.wood);
  cylinder(0.42, 0.42, 1.0, -17.4, 0.5, -6.2, mats.barrel);
  cylinder(0.42, 0.42, 1.0, -16.4, 0.5, -6.0, mats.barrelBlue);

  // ---- site B: WAREHOUSE (north-east) — open-front shed with interior cover ----
  box(12, 0.5, 9, 14, 6.2, -11, mats.steelDark); // roof
  box(0.5, 6.5, 9, 8.2, 3.25, -11, mats.steel); // west wall
  box(0.5, 6.5, 9, 19.8, 3.25, -11, mats.steel); // east wall
  box(12, 6.5, 0.5, 14, 3.25, -15.3, mats.steel); // back wall
  box(12, 1.0, 0.5, 14, 3.1, -6.8, mats.steelDark); // front lintel (open below, 2.6 m clear)
  box(2.5, 2.6, 6.1, 17, 1.3, -12.5, containerMats[5]);
  box(1.2, 1.2, 1.2, 10.6, 0.6, -8.6, mats.wood);
  box(1.2, 1.2, 1.2, 10.6, 1.8, -8.6, mats.wood);
  box(1.2, 1.2, 1.2, 17.8, 0.6, -8.8, mats.wood);
  cylinder(0.42, 0.42, 1.0, 18.5, 0.5, -9.5, mats.barrelBlue);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), mats.glass);
  win.position.set(14, 4.6, -6.55);
  win.rotation.y = Math.PI;
  group.add(win);

  // ---- mid: container stacks + cover lanes ----
  box(6.1, 2.6, 2.5, -12, 1.3, -1.5, containerMats[1]);
  box(6.1, 2.6, 2.5, -12, 3.9, -1.5, containerMats[0]);
  box(6.1, 2.6, 2.5, 12, 1.3, 1.5, containerMats[3]);
  box(2.5, 2.6, 6.1, 18, 1.3, -5.2, containerMats[2]);
  // v3: the crate stack that sat at (4.5,-1.5) moved to the south wall (-8,15) —
  // its old spot is the east platform's footprint, and mid-map spots all sit on
  // the west-mid diagonals (edges 6->7, 9->11, 19->11).
  box(1.2, 1.2, 1.2, -8.0, 0.6, 15.0, mats.wood);
  box(1.2, 1.2, 1.2, -6.8, 0.6, 15.0, mats.wood);
  box(1.2, 1.2, 1.2, -8.0, 1.8, 15.0, mats.wood);
  cylinder(0.42, 0.42, 1.0, 11.5, 0.5, -4.6, mats.barrel);
  cylinder(0.42, 0.42, 1.0, 10.6, 0.5, -1.2, mats.barrelBlue);
  cylinder(0.42, 0.42, 1.0, -10.5, 0.5, 4.2, mats.barrel);

  // ---- south: attacker approach cover + dock office ----
  box(6.1, 2.6, 2.5, -15, 1.3, 11, containerMats[4]);
  box(6.1, 2.6, 2.5, 15, 1.3, 11, containerMats[2]);
  box(1.2, 1.2, 1.2, -2.0, 0.6, 12.4, mats.wood);
  box(1.2, 1.2, 1.2, 2.0, 0.6, 12.4, mats.wood);
  box(3.4, 2.8, 2.4, 0, 1.4, 16.6, mats.corrugated); // dock office (corrugated steel)
  box(3.4, 0.3, 2.8, 0, 3.0, 16.6, mats.steelDark);

  // ---- v2 density: mid-map cover, site clutter, warehouse interior ----
  box(1.7, 1.1, 2.4, -3.5, 0.55, 4.5, mats.steelDark); // forklift body
  box(0.18, 2.3, 1.5, -3.5, 1.15, 3.4, mats.hazard); // forklift mast
  box(0.12, 0.08, 1.1, -3.8, 0.12, 2.6, mats.steel);
  box(0.12, 0.08, 1.1, -3.2, 0.12, 2.6, mats.steel);
  cylinder(0.75, 0.75, 0.9, 3.5, 0.45, 5.5, mats.wood); // cable reels
  cylinder(0.75, 0.75, 0.9, -6.5, 0.45, -2.5, mats.wood); // v3: was (-4.5,-1.5), its
  // corner clipped edge 6->7; (-6.5,-2.5) clears every lane
  box(1.2, 1.2, 1.2, 5.5, 0.6, -6.5, mats.wood);
  box(1.2, 1.2, 1.2, 5.5, 1.8, -6.5, mats.wood);
  box(1.2, 1.2, 1.2, -4.5, 0.6, -6.0, mats.wood);
  // v3: the (6.5,3.5) pallet stack moved to (1.5,5.2) — its old spot is the
  // east platform's footprint now.
  box(1.2, 1.2, 1.2, 1.5, 0.6, 5.2, mats.wood);
  box(1.2, 1.2, 1.2, 1.5, 1.8, 5.2, mats.wood);
  // v3: the (5.5,-6.5) pallet stack moved to (6.5,16.0) — it stood under the
  // east catwalk deck, its top touching the deck, and (-2,-7.5) clipped edge 19->11.
  box(1.2, 1.2, 1.2, 6.5, 0.6, 16.0, mats.wood);
  box(1.2, 1.2, 1.2, 6.5, 1.8, 16.0, mats.wood);
  cylinder(0.42, 0.42, 1.0, -1.5, 0.5, 6.5, mats.barrel);
  cylinder(0.42, 0.42, 1.0, 1.5, 0.5, 6.6, mats.barrelBlue);
  cylinder(0.42, 0.42, 1.0, 1.0, 0.5, -8.0, mats.barrelBlue);
  cylinder(0.42, 0.42, 1.0, 1.9, 0.5, -7.6, mats.barrel);
  cylinder(0.42, 0.42, 1.0, -9.5, 0.5, 3.5, mats.barrel);
  // v3: the (11.5,-3.5)/(12.4,-3.1) barrels moved to (11.5,-1.0)/(12.4,-0.6) —
  // they stood on the east wall lane's exit into mid.
  cylinder(0.42, 0.42, 1.0, 11.5, 0.5, -1.0, mats.barrel);
  cylinder(0.42, 0.42, 1.0, 12.4, 0.5, -0.6, mats.barrelBlue);
  box(6.1, 2.6, 2.5, -14, 1.3, 2.5, mats.stencilBay2);
  box(6.1, 2.6, 2.5, 14, 1.3, 4.5, mats.stencilBay4);
  box(6.1, 2.6, 2.5, -12, 3.9, -1.5, containerMats[2]);
  box(6.1, 2.6, 2.5, 12, 3.9, 1.5, containerMats[5]);
  for (const cx of [-16, -14, -12]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), mats.steelDark);
    chain.position.set(cx, 9.4, -10);
    group.add(chain);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mats.lamp);
    lamp.position.set(cx, 7.7, -10);
    group.add(lamp);
  }
  box(2.2, 0.9, 0.8, 17.5, 0.45, -13.8, mats.wood); // warehouse workbench
  box(1.0, 1.8, 0.6, 9.5, 0.9, -14.8, mats.steelDark); // tool cabinet
  const whCord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), mats.steelDark);
  whCord.position.set(14, 5.5, -11);
  group.add(whCord);
  const whLamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mats.lamp);
  whLamp.position.set(14, 4.7, -11);
  group.add(whLamp);

  // ---- v3 multi-level: two climbable platforms + catwalks + east wall lane ----
  // West platform: container top at 2.6 m, reached by three 0.65 m steps up its
  // south face, left by a catwalk north to site A. East platform mirrors it to B.
  // Steps are solid boxes from the ground; the mover auto-steps each 0.65 m rise.
  // Catwalk rails and support posts are visual only (deco), so they never block a
  // bot walking the deck or the ground beneath it.
  box(6.1, 2.6, 2.5, -7, 1.3, 1.0, containerMats[0]); // west platform container
  box(1.4, 0.65, 0.7, -7, 0.325, 3.3, mats.wood); // west stairs up
  box(1.4, 1.3, 0.7, -7, 0.65, 2.75, mats.wood);
  box(1.4, 1.95, 0.7, -7, 0.975, 2.2, mats.wood);
  box(1.6, 0.2, 4.2, -7, 2.5, -2.3, mats.steel); // west catwalk deck
  box(1.6, 0.2, 4.2, -7, 2.5, -6.4, mats.steel);
  deco(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 8.3), mats.steelDark)).position.set(-7.8, 2.85, -4.35);
  deco(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 8.3), mats.steelDark)).position.set(-6.2, 2.85, -4.35);
  for (const [px, pz] of [[-7.75, -0.5], [-6.25, -0.5], [-7.75, -8.2], [-6.25, -8.2]]) {
    deco(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), mats.steelDark)).position.set(px, 1.2, pz);
  }
  // west descent: deck end steps sideways to a platform, then down to A ground
  box(2.6, 0.2, 2.2, -6.25, 2.5, -9.4, mats.steel);
  box(1.4, 1.95, 0.7, -5.5, 0.975, -10.3, mats.wood);
  box(1.4, 1.3, 0.7, -5.5, 0.65, -11.35, mats.wood);
  box(1.4, 0.65, 0.7, -5.5, 0.325, -11.9, mats.wood);
  box(5.0, 2.6, 2.5, 5.0, 1.3, 3.5, containerMats[3]); // east platform container
  box(1.4, 0.65, 0.7, 5.0, 0.325, 5.9, mats.wood); // east stairs up
  box(1.4, 1.3, 0.7, 5.0, 0.65, 5.35, mats.wood);
  box(1.4, 1.95, 0.7, 5.0, 0.975, 4.8, mats.wood);
  box(1.6, 0.2, 4.7, 5.0, 2.5, 0, mats.steel); // east catwalk deck
  box(1.6, 0.2, 4.2, 5.0, 2.5, -4.35, mats.steel);
  box(1.6, 0.2, 2.2, 5.0, 2.5, -7.5, mats.steel);
  deco(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 8.6), mats.steelDark)).position.set(4.2, 2.85, -4.3);
  deco(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 8.6), mats.steelDark)).position.set(5.8, 2.85, -4.3);
  for (const [px, pz] of [[4.25, -0.5], [5.75, -0.5], [4.25, -8.2], [5.75, -8.2]]) {
    deco(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), mats.steelDark)).position.set(px, 1.2, pz);
  }
  box(2.6, 0.2, 2.2, 5.75, 2.5, -9.4, mats.steel); // east descent platform
  box(1.4, 1.95, 0.7, 5.0, 0.975, -10.3, mats.wood);
  box(1.4, 1.3, 0.7, 5.0, 0.65, -11.35, mats.wood);
  box(1.4, 0.65, 0.7, 5.0, 0.325, -11.9, mats.wood);
  // hazard strip on the stair nosings, so the climb reads at a glance
  box(1.4, 0.06, 0.1, -7, 0.68, 2.95, mats.hazard, false);
  box(1.4, 0.06, 0.1, 5.0, 0.68, 5.55, mats.hazard, false);

  // ---- site markers: glowing ground rings + floating labels ----
  function siteMarker(x, z, label, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,16,22,0.72)';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 90);
    ctx.fillStyle = color;
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 128, 62);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(5.4, 2.0, 1);
    sprite.position.set(x, 4.4, z);
    group.add(sprite);
    return { ring, sprite };
  }
  const markerA = siteMarker(-15, -10, 'SITE A', PALETTE.accent);
  const markerB = siteMarker(14, -11, 'SITE B', PALETTE.accent);

  // ---- lighting: low dawn sun from the north-east, cool fill, warm sky ----
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffd9a0'), new THREE.Color('#1b2a38'), 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 2.6);
  sun.position.set(28, 16, -34);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f87a0'), 0.5);
  fill.position.set(-14, 10, 18);
  scene.add(fill);

  // ---- spawns ----
  // (v3 fix: RUE spawned at (15,-16) BEHIND the warehouse back wall and FINN at
  // (19,-14) behind the interior container — both spent whole rounds pushing a
  // wall/container they could never pass, because their first waypoint sat on the
  // far side of it. Both now spawn inside the warehouse with a clear run out.
  // v3 fix 2: ONNO (B anchor) spawned on the A side (-12,-16) and RUE (A
  // retaker) on the B side (15,-14), so both walked across mid to reach their
  // holds and died en route before any plant — RUE died at (9.4,-5) every
  // round. Swapped: each now spawns on its own side, a short safe walk from
  // its hold.)
  const spawns = {
    attack: [[-5, 14.5], [-2.5, 14.5], [0, 14.5], [2.5, 14.5], [5, 14.5]],
    defend: [[-17, -15.5], [15, -14], [11, -14.5], [-12, -16], [10, -12]],
  };
  const sites = {
    A: { x: -15, z: -10, label: 'SITE A — CRANE YARD' },
    B: { x: 14, z: -11, label: 'SITE B — WAREHOUSE' },
  };

  // ---- waypoint graph for bots (nodes + adjacency by id) ----
  // v3: waypoint 7 moved to (-6,-5) — its old spot (-8,0) is the west platform's
  // footprint now, and the west lane runs 3 -> 5 -> 6 -> 7 -> 9. Waypoint 8 stays
  // at (8,0): the east platform was shifted west so the 4->8 lane clears it.
  // nearestWaypoint is 3D, so a bot on the ground never snaps to a deck node and
  // a bot on the deck never snaps to a ground node under it.
  const waypoints = [
    { id: 0, x: 0, z: 14.5, y: 0 },
    { id: 1, x: -8, z: 13, y: 0 },
    { id: 2, x: 8, z: 13, y: 0 },
    { id: 3, x: -8, z: 7, y: 0 },
    { id: 4, x: 8, z: 7, y: 0 },
    { id: 5, x: 0, z: 8, y: 0 },
    { id: 6, x: 0, z: 2, y: 0 },
    { id: 7, x: -6, z: -5, y: 0 },
    { id: 8, x: 8, z: 0, y: 0 },
    { id: 9, x: -7.5, z: -6, y: 0 },
    { id: 10, x: 8, z: -5, y: 0 },
    { id: 11, x: 0, z: -2, y: 0 },
    { id: 12, x: -13, z: -10, y: 0 },
    { id: 13, x: -15, z: -10, y: 0 },
    { id: 14, x: 14, z: -6, y: 0 },
    { id: 15, x: 14, z: -11, y: 0 },
    { id: 16, x: -15, z: -12.5, y: 0 },
    { id: 17, x: 11, z: -14, y: 0 },
    { id: 18, x: 0, z: -11, y: 0 },
    { id: 19, x: -4, z: -9, y: 0 },
    { id: 20, x: 4, z: -9, y: 0 },
    { id: 21, x: -7, z: 4.15, y: 0 }, // west stair approach (ground)
    { id: 22, x: -7, z: 2.75, y: 1.3 }, // west step 2
    { id: 23, x: -7, z: 1.0, y: 2.6 }, // west platform top
    { id: 24, x: -7, z: -4.4, y: 2.6 }, // west catwalk mid
    { id: 25, x: -6.25, z: -9.4, y: 2.6 }, // west descent platform
    { id: 26, x: -5.5, z: -10.3, y: 1.95 }, // west descent step 1
    { id: 27, x: -5.5, z: -11.35, y: 1.3 }, // west descent step 2
    { id: 28, x: -5.5, z: -13.0, y: 0 }, // west landing (ground, site A side)
    { id: 29, x: 5.0, z: 6.8, y: 0 }, // east stair approach (ground)
    { id: 30, x: 5.0, z: 5.35, y: 1.3 }, // east step 2
    { id: 31, x: 5.0, z: 3.5, y: 2.6 }, // east platform top
    { id: 32, x: 5.0, z: -2.3, y: 2.6 }, // east catwalk mid
    { id: 33, x: 5.75, z: -9.4, y: 2.6 }, // east descent platform
    { id: 34, x: 5.0, z: -10.3, y: 1.95 }, // east descent step 1
    { id: 35, x: 5.0, z: -11.35, y: 1.3 }, // east descent step 2
    { id: 36, x: 5.0, z: -13.0, y: 0 }, // east landing (ground, site B side)
    { id: 37, x: 20.5, z: 6, y: 0 }, // east wall lane, south
    { id: 38, x: 20.5, z: -1.5, y: 0 }, // east wall lane, north
    { id: 39, x: 16, z: -0.5, y: 0 }, // east wall lane exit into mid
  ];
  const edges = [
    [0, 1], [0, 2], [0, 5], [1, 3], [2, 4], [1, 5], [2, 5], [3, 5], [4, 5],
    [4, 8], [5, 6], [6, 7], [6, 8], [7, 9], [8, 10], [6, 11], [9, 11],
    [10, 11], [9, 12], [12, 13], [12, 16], [13, 16], [13, 19], [19, 11], [19, 18],
    [10, 14], [14, 15], [15, 17], [17, 14], [20, 11], [20, 18], [11, 18],
    [12, 19], [19, 20],
    [3, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27], [27, 28], [28, 12],
    [5, 29], [29, 30], [30, 31], [31, 32], [32, 33], [33, 34], [34, 35], [35, 36], [36, 18],
    [4, 37], [37, 38], [38, 39], [39, 10],
  ];
  const adjacency = waypoints.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function nearestWaypoint(x, z, y = 0, exclude = -1) {
    let best = 0;
    let bestD = Infinity;
    for (const w of waypoints) {
      if (w.id === exclude) continue;
      const d = (w.x - x) ** 2 + (w.z - z) ** 2 + ((w.y ?? 0) - y) ** 2;
      if (d < bestD) { bestD = d; best = w.id; }
    }
    return best;
  }

  // BFS shortest path between waypoint ids.
  function findPath(fromId, toId) {
    if (fromId === toId) return [toId];
    const prev = new Array(waypoints.length).fill(-1);
    const queue = [fromId];
    prev[fromId] = fromId;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === toId) {
          const path = [toId];
          let n = toId;
          while (n !== fromId) { n = prev[n]; path.unshift(n); }
          return path;
        }
        queue.push(next);
      }
    }
    return [toId];
  }

  return {
    colliders, shootables, group, spawns, sites, waypoints, edges, findPath, nearestWaypoint,
    markers: { A: markerA, B: markerB },
  };
}
