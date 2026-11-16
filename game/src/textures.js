// Procedural canvas textures: no image files, no network. Every texture is drawn once
// at boot from a seeded RNG so the map looks the same every load.
import * as THREE from 'three';

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

function canvasTexture(size, draw, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, rnd, count, alpha, dark = true) {
  for (let i = 0; i < count; i += 1) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Corrugated container side in a flat color, with ribs, rust streaks and a stencilled code.
export function containerTexture(base, code, seed = 1) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    // vertical ribs
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 5, s);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 5, 0, 3, s);
    }
    // rust streaks from the top
    for (let i = 0; i < 26; i += 1) {
      const x = rnd() * s;
      const len = 20 + rnd() * 90;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(90,50,20,0.35)');
      grad.addColorStop(1, 'rgba(90,50,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 2 + rnd() * 4, len);
    }
    speckle(ctx, s, rnd, 900, 0.16);
    // stencil code
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(code, 18, 44);
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('TIDEWATER TERMINAL', 18, 68);
    // hazard stripe along the bottom
    for (let x = -20; x < s + 20; x += 28) {
      ctx.fillStyle = 'rgba(255,180,40,0.85)';
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 14, s - 18);
      ctx.lineTo(x + 28, s - 18);
      ctx.lineTo(x + 14, s);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function concreteTexture(seed = 7) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5d6a72';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rnd, 2600, 0.14);
    speckle(ctx, s, rnd, 500, 0.1, false);
    // expansion joints
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
    // oil stains
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = `rgba(20,22,26,${0.08 + rnd() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * s, rnd() * s, 12 + rnd() * 26, 8 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 6);
}

export function asphaltTexture(seed = 11) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3c444b';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rnd, 3200, 0.2);
    speckle(ctx, s, rnd, 700, 0.08, false);
    // faded lane line
    ctx.fillStyle = 'rgba(240,200,80,0.5)';
    ctx.fillRect(s / 2 - 4, 0, 8, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = 'rgba(60,68,75,0.9)';
      ctx.fillRect(s / 2 - 4, y, 8, 16);
    }
  }, 8);
}

export function metalTexture(base, seed = 3) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
      ctx.fillRect(0, y, s, 1);
    }
    speckle(ctx, s, rnd, 1200, 0.12);
  });
}

// Diagonal hazard stripes (yellow/black) for forklift bases, bay edges, prop accents.
export function hazardTexture(seed = 13) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#15181c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8a81c';
    for (let x = -s; x < s * 2; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 21, 0);
      ctx.lineTo(x + 42, 0);
      ctx.lineTo(x + 21, s);
      ctx.closePath();
      ctx.fill();
    }
    speckle(ctx, s, rnd, 500, 0.12);
  });
}

// Big stencilled bay code on dark steel (warehouse walls, container sides).
export function stencilTexture(text, seed = 17) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#2c3841';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rnd, 1400, 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, s / 2, s / 2 + 22);
    ctx.font = '18px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('TIDEWATER TERMINAL', s / 2, s / 2 + 56);
  });
}

// Corrugated metal with horizontal ribs (dock office, shed panels) — the
// container texture's ribs are vertical; this one reads as a different surface.
export function corrugatedTexture(base, seed = 19) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 14) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y, s, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + 4, s, 3);
    }
    speckle(ctx, s, rnd, 1100, 0.12);
  });
}

export function waterTexture(seed = 5) {
  const rnd = mulberry32(seed);
  return canvasTexture(256, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#16324a');
    grad.addColorStop(0.5, '#1d4a63');
    grad.addColorStop(1, '#12283c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 40; i += 1) {
      const y = rnd() * s;
      const x = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + rnd() * 40, y);
      ctx.stroke();
    }
  }, 10);
}

export function skyTexture() {
  return canvasTexture(512, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#16283e');
    grad.addColorStop(0.45, '#3a5a74');
    grad.addColorStop(0.72, '#c97a4e');
    grad.addColorStop(0.85, '#f2a35e');
    grad.addColorStop(1, '#ffd9a0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    // sun glow
    const glow = ctx.createRadialGradient(s * 0.68, s * 0.78, 4, s * 0.68, s * 0.78, 150);
    glow.addColorStop(0, 'rgba(255,210,140,0.95)');
    glow.addColorStop(0.25, 'rgba(255,170,90,0.45)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    // a few high clouds
    ctx.fillStyle = 'rgba(255,235,220,0.10)';
    for (let i = 0; i < 12; i += 1) {
      const y = 40 + (i % 4) * 46;
      const x = (i * 137) % s;
      ctx.beginPath();
      ctx.ellipse(x, y, 34 + (i % 3) * 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
