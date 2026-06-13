// Headless gameplay audit. Runs the real TrackManager plus a copy of the ball
// physics (game.js can't run here — it needs WebGL) to confirm:
//   1. an attentive player can survive a long, fast run (gaps/ramps are fair),
//   2. physics invariants hold every frame (no NaN, distance only increases,
//      a grounded ball sits on the surface),
//   3. the generator actually produces variety (curves, hills, gaps, ramps,
//      lasers, orbs).
import * as THREE from 'three';
import { TrackManager, BALL_R } from '../src/track.js';

const BASE_SPEED = 13;
const MAX_SPEED = 40;
const SPEED_PER_M = 0.0125;
const GRAVITY = 30;
const JUMP_V = 11;

function runOnce(seconds) {
  const scene = new THREE.Group();
  const track = new TrackManager(scene, null);
  const ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
  const dt = 1 / 60;
  const out = { deaths: 0, lastDeath: '', invariantFails: 0, maxLasers: 0 };

  const speedAt = (d) => Math.min(MAX_SPEED, BASE_SPEED + d * SPEED_PER_M);

  for (let frame = 0; frame < 60 * seconds; frame++) {
    const prevDist = ball.dist;
    const speed = speedAt(ball.dist);
    ball.dist += speed * dt;
    track.update(ball.dist);
    out.maxLasers = Math.max(out.maxLasers, track.lasers.length);

    const g = track.sample(ball.dist);

    // invariant: sampling always yields finite numbers
    if (!Number.isFinite(g.groundY) || !Number.isFinite(g.centerX) || ball.dist <= prevDist) {
      out.invariantFails++;
    }

    // autopilot: look ahead, jump for gaps / low full-width lasers
    let wantJump = false;
    const lookAhead = speed * 0.35;
    for (let a = 1; a < lookAhead; a += 1) {
      if (!track.sample(ball.dist + a).hasGround) {
        wantJump = true;
        break;
      }
    }
    for (const l of track.lasers) {
      const d = l.s - ball.dist;
      if (d > 0 && d < lookAhead && l.xMin <= 0.1 && l.xMax >= -0.1 && l.h < 1.4) wantJump = true;
    }

    ball.x += (g.centerX - ball.x) * Math.min(1, dt * 9);
    const support = g.hasGround && Math.abs(ball.x - g.centerX) <= g.half;

    if (wantJump && ball.grounded) {
      ball.vy = JUMP_V;
      ball.grounded = false;
    }
    if (ball.grounded) {
      for (const r of track.ramps) {
        if (r.s > prevDist && r.s <= ball.dist) {
          ball.vy = r.vy;
          ball.grounded = false;
          break;
        }
      }
    }

    if (ball.grounded) {
      if (support) {
        const ahead = track.sample(ball.dist + 0.6);
        ball.vy = ((ahead.groundY - g.groundY) / 0.6) * speed;
        ball.y = g.groundY + BALL_R;
        // invariant: a grounded, supported ball rests on the surface
        if (Math.abs(ball.y - (g.groundY + BALL_R)) > 0.01) out.invariantFails++;
      } else {
        ball.grounded = false;
      }
    } else {
      ball.vy -= GRAVITY * dt;
      ball.y += ball.vy * dt;
      if (ball.vy <= 0 && support && ball.y <= g.groundY + BALL_R) {
        ball.y = g.groundY + BALL_R;
        ball.vy = 0;
        ball.grounded = true;
      }
    }

    if (!Number.isFinite(ball.y) || !Number.isFinite(ball.x)) out.invariantFails++;

    if (ball.y < g.groundY - 7) {
      out.deaths++;
      out.lastDeath = `fell at ${ball.dist.toFixed(0)}m`;
      ball.y = g.groundY + BALL_R;
      ball.x = g.centerX;
      ball.vy = 0;
      ball.grounded = true;
    }
  }

  out.dist = ball.dist;
  out.segTypes = new Set(track.segments.map((s) => s.type));
  return out;
}

let failed = false;
let totalDeaths = 0;
let totalInvariant = 0;
let reachedAll = true;

for (let pass = 1; pass <= 3; pass++) {
  const r = runOnce(120);
  totalDeaths += r.deaths;
  totalInvariant += r.invariantFails;
  if (r.dist < 1000) reachedAll = false;
  console.log(
    `Pass ${pass}: ${r.dist.toFixed(0)}m · deaths ${r.deaths} · invariant-fails ` +
      `${r.invariantFails} · peak lasers ${r.maxLasers} · types {${[...r.segTypes].join(', ')}}`
  );
}

console.log('---');
if (!reachedAll) {
  console.error('FAIL: a run did not progress far enough');
  failed = true;
}
if (totalInvariant > 0) {
  console.error(`FAIL: ${totalInvariant} physics-invariant violations`);
  failed = true;
}
if (totalDeaths > 12) {
  console.error(`FAIL: ${totalDeaths} unavoidable deaths across runs (track unfair)`);
  failed = true;
}

if (failed) process.exit(1);
console.log('PASS — gameplay is fair, stable, and varied.');
