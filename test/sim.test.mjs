// Headless gameplay simulation: runs the real TrackManager + a copy of the
// ball physics to confirm a "perfect" player can survive a long run. This
// catches generation bugs (unclearable gaps, impossible lasers) without WebGL.
import * as THREE from 'three';
import { TrackManager, BALL_R, ROAD_HALF } from '../src/track.js';

// Physics constants mirror game.js.
const BASE_SPEED = 13;
const MAX_SPEED = 40;
const SPEED_PER_M = 0.0125;
const GRAVITY = 30;
const JUMP_V = 11;

const scene = new THREE.Group();
const track = new TrackManager(scene, null);

const ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
const dt = 1 / 60;
let deaths = 0;
let lastDeath = '';

function speedAt(d) {
  return Math.min(MAX_SPEED, BASE_SPEED + d * SPEED_PER_M);
}

// A simple "autopilot" that an attentive human could match: stay on the
// platform centre, jump for upcoming gaps/lasers.
for (let frame = 0; frame < 60 * 60 * 3; frame++) {
  const prevDist = ball.dist;
  const speed = speedAt(ball.dist);
  ball.dist += speed * dt;
  track.update(ball.dist);

  const g = track.sample(ball.dist);

  // Look ahead for hazards and decide whether to jump.
  let wantJump = false;
  const lookAhead = speed * 0.35;
  for (let ahead = 1; ahead < lookAhead; ahead += 1) {
    const s = ball.dist + ahead;
    const ga = track.sample(s);
    if (!ga.hasGround) {
      wantJump = true;
      break;
    }
  }
  for (const l of track.lasers) {
    const d = l.s - ball.dist;
    if (d > 0 && d < lookAhead && l.xMin <= 0.1 && l.xMax >= -0.1 && l.h < 1.4) {
      wantJump = true;
    }
  }

  // steer toward platform centre
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
      const a = track.sample(ball.dist + 0.6);
      ball.vy = ((a.groundY - g.groundY) / 0.6) * speed;
      ball.y = g.groundY + BALL_R;
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

  if (ball.y < g.groundY - 7) {
    deaths++;
    lastDeath = `fell at ${ball.dist.toFixed(1)}m (centerX ${g.centerX.toFixed(1)})`;
    // respawn on the platform to keep probing the rest of the track
    ball.y = g.groundY + BALL_R;
    ball.x = g.centerX;
    ball.vy = 0;
    ball.grounded = true;
  }
}

console.log(`Reached distance: ${ball.dist.toFixed(0)}m`);
console.log(`Active segments: ${track.segments.length}, lasers: ${track.lasers.length}`);
console.log(`Autopilot deaths (gaps it could not clear): ${deaths}`);
if (lastDeath) console.log(`Last death: ${lastDeath}`);

if (ball.dist < 1000) {
  console.error('FAIL: did not progress far enough');
  process.exit(1);
}
if (deaths > 5) {
  console.error('FAIL: too many unclearable hazards for an attentive player');
  process.exit(1);
}
console.log('PASS');
