// Generates app icon + splash source artwork (a glowing neon ball) with pure
// JS — no native image libraries. Output goes to assets/, which
// `npx @capacitor/assets generate` then resizes into the native projects.
import { PNG } from 'pngjs';
import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, v | 0));
const mix = (a, b, t) => a + (b - a) * t;

// Background colours (top -> bottom).
const BG_TOP = [8, 11, 26];
const BG_BOT = [42, 30, 90];
// Ball + accents.
const BALL = [54, 224, 255];
const RING = [255, 59, 129];
// Light direction (toward upper-left, slightly out of screen).
const L = (() => {
  const v = [-0.45, -0.5, 0.74];
  const m = Math.hypot(...v);
  return v.map((c) => c / m);
})();

function setPx(png, x, y, r, g, b, a) {
  const i = (png.width * y + x) << 2;
  png.data[i] = clamp(r);
  png.data[i + 1] = clamp(g);
  png.data[i + 2] = clamp(b);
  png.data[i + 3] = clamp(a);
}

function fillBackground(png) {
  for (let y = 0; y < png.height; y++) {
    const t = y / (png.height - 1);
    const r = mix(BG_TOP[0], BG_BOT[0], t);
    const g = mix(BG_TOP[1], BG_BOT[1], t);
    const b = mix(BG_TOP[2], BG_BOT[2], t);
    for (let x = 0; x < png.width; x++) setPx(png, x, y, r, g, b, 255);
  }
}

function drawBall(png, cx, cy, R, transparent) {
  const glow = R * 0.85;
  const max = R + glow;
  const x0 = Math.max(0, Math.floor(cx - max));
  const x1 = Math.min(png.width - 1, Math.ceil(cx + max));
  const y0 = Math.max(0, Math.floor(cy - max));
  const y1 = Math.min(png.height - 1, Math.ceil(cy + max));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const i = (png.width * y + x) << 2;

      if (d <= R) {
        // Sphere shading.
        const nx = dx / R;
        const ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const shade = 0.22 + 0.78 * diff;
        let r = BALL[0] * shade;
        let g = BALL[1] * shade;
        let b = BALL[2] * shade;
        // Specular hot-spot.
        const spec = Math.pow(diff, 22) * 255;
        r += spec;
        g += spec;
        b += spec;
        // Pink equator band.
        const band = Math.max(0, 1 - Math.abs(ny) / 0.1);
        r = mix(r, RING[0], band * 0.8);
        g = mix(g, RING[1], band * 0.8);
        b = mix(b, RING[2], band * 0.8);
        setPx(png, x, y, r, g, b, 255);
      } else if (d <= max) {
        // Additive outer glow.
        const t = 1 - (d - R) / glow;
        const intensity = t * t;
        if (transparent) {
          setPx(png, x, y, BALL[0], BALL[1], BALL[2], intensity * 200);
        } else {
          setPx(
            png,
            x,
            y,
            png.data[i] + BALL[0] * intensity * 0.7,
            png.data[i + 1] + BALL[1] * intensity * 0.7,
            png.data[i + 2] + BALL[2] * intensity * 0.7,
            255
          );
        }
      }
    }
  }
}

function write(name, png) {
  return new Promise((res, rej) => {
    const s = createWriteStream(resolve(OUT, name));
    png.pack().pipe(s);
    s.on('finish', res);
    s.on('error', rej);
  });
}

function blank(size, transparent) {
  const png = new PNG({ width: size, height: size });
  if (transparent) png.data.fill(0);
  return png;
}

async function main() {
  // Adaptive-icon background (gradient only).
  const bg = blank(1024, false);
  fillBackground(bg);
  await write('icon-background.png', bg);

  // Adaptive-icon foreground (ball within the ~66% safe zone, transparent).
  const fg = blank(1024, true);
  drawBall(fg, 512, 512, 1024 * 0.26, true);
  await write('icon-foreground.png', fg);

  // Full app icon (composited).
  const icon = blank(1024, false);
  fillBackground(icon);
  drawBall(icon, 512, 512, 1024 * 0.32, false);
  await write('icon-only.png', icon);

  // Splash (light + dark are the same dark theme here).
  for (const name of ['splash.png', 'splash-dark.png']) {
    const sp = blank(2732, false);
    fillBackground(sp);
    drawBall(sp, 1366, 1366, 2732 * 0.13, false);
    await write(name, sp);
  }

  console.log('Generated icon + splash assets in assets/');
}

main();
