// Shared AABB mover: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows a body.
// Used by the player and by every bot. v3 adds auto-step: a mover walking into a low
// ledge (top at most 0.75 m above its feet, with headroom clear above it) steps up
// onto it instead of stopping. That is what makes the v3 staircases climbable: the
// stairs rise in 0.65 m steps, containers are 2.6 m (far above the step cap, so they
// still block), and 1.2 m crates still need a jump. Bots never jump, so without this
// they could never use the catwalks at all.
import * as THREE from 'three';

const RADIUS = 0.34;
const STEP_MAX = 0.75;

export function createMover(colliders, startX, startZ, opts = {}) {
  const height = opts.height ?? 1.72;
  const eyeHeight = opts.eye ?? 1.6;
  const walkSpeed = opts.speed ?? 5.2;
  const state = {
    position: new THREE.Vector3(startX, 0, startZ),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: eyeHeight,
    onGround: true,
    crouching: false,
    height,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + h - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // Try to step up onto `blocker` and then move to (nx, nz). Returns true if the
  // move was taken at the higher level. Only low ledges qualify, and the space
  // above the ledge must be free, so a mover can never step into a ceiling or a wall.
  function tryStepUp(blocker, nx, nz) {
    const rise = blocker.max.y - state.position.y;
    if (rise <= 0.05 || rise > STEP_MAX) return false;
    if (overlaps(nx, blocker.max.y, nz, state.height, 0.02)) return false;
    if (overlaps(state.position.x, blocker.max.y, state.position.z, state.height, 0.02)) return false;
    state.position.y = blocker.max.y;
    state.velocity.y = 0;
    state.onGround = true;
    return true;
  }

  function step(dt, moveX, moveZ, wantJump, wantCrouch) {
    const crouchHeight = height * 0.65;
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = crouchHeight;
    } else if (!wantCrouch && state.crouching && !overlaps(state.position.x, state.position.y, state.position.z, height, 0.02)) {
      state.crouching = false;
      state.height = height;
    }
    const eyeTarget = state.crouching ? eyeHeight * 0.64 : eyeHeight;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const speed = state.crouching ? walkSpeed * 0.46 : walkSpeed;
    const accel = state.onGround ? 42 : 9;
    const blend = Math.min(1, (accel * dt) / speed);
    state.velocity.x += (moveX * speed - state.velocity.x) * blend;
    state.velocity.z += (moveZ * speed - state.velocity.z) * blend;
    if (state.onGround && moveX === 0 && moveZ === 0) {
      const damp = Math.max(0, 1 - 9 * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    if (wantJump && state.onGround) {
      state.velocity.y = 6.2;
      state.onGround = false;
    }
    state.velocity.y -= 20 * dt;

    const nextX = state.position.x + state.velocity.x * dt;
    if (!overlaps(nextX, state.position.y, state.position.z, state.height, 0.04)) {
      state.position.x = nextX;
    } else {
      const blocker = overlaps(nextX, state.position.y, state.position.z, state.height, 0.04);
      if (!blocker || !tryStepUp(blocker, nextX, state.position.z)) state.velocity.x = 0;
      else state.position.x = nextX;
    }
    const nextZ = state.position.z + state.velocity.z * dt;
    if (!overlaps(state.position.x, state.position.y, nextZ, state.height, 0.04)) {
      state.position.z = nextZ;
    } else {
      const blocker = overlaps(state.position.x, state.position.y, nextZ, state.height, 0.04);
      if (!blocker || !tryStepUp(blocker, state.position.x, nextZ)) state.velocity.z = 0;
      else state.position.z = nextZ;
    }

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = overlaps(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0) {
      state.position.y = hit.max.y;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (hit) {
      state.position.y = hit.min.y - state.height;
      state.velocity.y = 0;
    }
    if (state.position.y < 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-30, state.velocity.y);
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  return { state, step, groundSpeed, overlaps };
}

// The player: keyboard + mouse look on top of the shared mover.
export function createPlayer(colliders) {
  const mover = createMover(colliders, 0, 15.5, { speed: 5.2 });
  const body = mover.state;

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    let mx = 0;
    let mz = 0;
    if (forward || strafe) {
      mx = -sin * forward + cos * strafe;
      mz = -cos * forward - sin * strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
    }
    mover.step(
      dt, mx, mz,
      keys.has('Space'),
      keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    );
  }

  return { state: body, step, look, recoil, groundSpeed: mover.groundSpeed, mover };
}
