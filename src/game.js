import * as THREE from 'three';
import { TrackManager, ROAD_HALF, BALL_R } from './track.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';

// ---- tuning ---------------------------------------------------------------
const BASE_SPEED = 13;
const MAX_SPEED = 40;
const SPEED_PER_M = 0.0125; // distance at which we hit MAX_SPEED ≈ 2160m
const GRAVITY = 30;
const JUMP_V = 11;
const STEER_EASE = 9;
const CAM_BACK = 9;
const CAM_HEIGHT = 4.4;
const LOOK_AHEAD = 16;

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.cb = callbacks;
    this.sfx = new Sfx();
    this.input = new Input(12);
    this.state = 'ready';

    this._initRenderer();
    this._initScene();
    this._initBall();

    this.track = new TrackManager(this.scene, this._roadTexture);

    this._clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------------------
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this._skyTexture = makeSkyTexture();
    this.scene.background = this._skyTexture;
    this.scene.fog = new THREE.Fog(0x141a3a, 60, 200);

    this._roadTexture = makeRoadTexture();

    const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x202a55, 0.9);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(-8, 20, 10);
    this.scene.add(dir);

    // Light that travels with the ball for a glowing-orb feel.
    this.ballLight = new THREE.PointLight(0x6fdcff, 1.4, 30, 2);
    this.scene.add(this.ballLight);

    this._addStars();

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(0, CAM_HEIGHT, CAM_BACK);
    this.camera.lookAt(0, 0, -LOOK_AHEAD);
  }

  _addStars() {
    const N = 600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = Math.random() * 120 + 20;
      pos[i * 3 + 2] = -Math.random() * 350;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.7, sizeAttenuation: true });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _initBall() {
    const geo = new THREE.SphereGeometry(BALL_R, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.6,
      roughness: 0.18,
      emissive: 0x2bd4ff,
      emissiveIntensity: 0.35,
    });
    this.ballMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.ballMesh);

    // A subtle equator stripe so rotation reads clearly.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_R + 0.005, 0.07, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xff3b81, emissive: 0xff3b81, emissiveIntensity: 0.7 })
    );
    this.ballMesh.add(ring);

    this.ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
  }

  // -------------------------------------------------------------------------
  start() {
    this.sfx.resume();
    this.track.reset();
    this.input.reset();
    this.ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
    this.orbCount = 0;
    this.prevDist = 0;
    this.ballMesh.rotation.set(0, 0, 0);
    this.state = 'playing';
  }

  _die(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.sfx.death();
    const dist = Math.floor(this.ball.dist);
    this.cb.onGameOver?.(reason, dist, this.orbCount);
  }

  // -------------------------------------------------------------------------
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 0.05);
    if (this.state === 'playing') this._step(dt);
    this._updateCamera(dt);
    this._animateDecor(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _step(dt) {
    const ball = this.ball;
    this.prevDist = ball.dist;

    const speed = Math.min(MAX_SPEED, BASE_SPEED + ball.dist * SPEED_PER_M);
    ball.dist += speed * dt;
    this.input.update(dt);
    this.track.update(ball.dist);

    // steering
    ball.x += (this.input.lateral - ball.x) * Math.min(1, dt * STEER_EASE);

    const g = this.track.sample(ball.dist);
    const support = g.hasGround && Math.abs(ball.x - g.centerX) <= g.half;

    // jump
    if (this.input.consumeJump() && ball.grounded) {
      ball.vy = JUMP_V;
      ball.grounded = false;
      this.sfx.jump();
    }

    // ramp launch: crossing a ramp lip flings the ball off
    if (ball.grounded) {
      for (const r of this.track.ramps) {
        if (r.s > this.prevDist && r.s <= ball.dist) {
          ball.vy = r.vy;
          ball.grounded = false;
          this.sfx.jump();
          break;
        }
      }
    }

    if (ball.grounded) {
      if (support) {
        // Follow the surface; remember slope so ramps fling the ball.
        const ahead = this.track.sample(ball.dist + 0.6);
        const slope = (ahead.groundY - g.groundY) / 0.6;
        ball.vy = slope * speed;
        ball.y = g.groundY + BALL_R;
      } else {
        ball.grounded = false; // ran off an edge or into a gap
      }
    } else {
      ball.vy -= GRAVITY * dt;
      ball.y += ball.vy * dt;
      if (ball.vy <= 0 && support && ball.y <= g.groundY + BALL_R) {
        ball.y = g.groundY + BALL_R;
        ball.vy = 0;
        ball.grounded = true;
        this.sfx.land();
      }
    }

    // fell off / into a gap
    if (ball.y < g.groundY - 7) {
      this._die('You fell off the track');
    }

    this._checkLasers(ball, speed);
    this._checkOrbs(ball);

    // rolling animation
    this.ballMesh.rotation.x -= (speed * dt) / BALL_R;
    this.ballMesh.position.set(ball.x, ball.y, -ball.dist);
    this.ballLight.position.set(ball.x, ball.y + 1.5, -ball.dist + 1);

    const speedFrac = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    this.cb.onUpdate?.(Math.floor(ball.dist), this.orbCount, speedFrac);
  }

  _checkLasers(ball, speed) {
    for (const l of this.track.lasers) {
      // Crossed this laser's plane during the frame?
      const crossed = l.s > this.prevDist - BALL_R && l.s <= ball.dist + BALL_R;
      if (!crossed) continue;
      const xHit = ball.x > l.xMin - BALL_R && ball.x < l.xMax + BALL_R;
      const yHit = ball.y - BALL_R < l.y + 0.12 && ball.y + BALL_R > l.y - 0.12;
      if (xHit && yHit) {
        this._die('You hit a laser');
        return;
      }
    }
  }

  _checkOrbs(ball) {
    for (const o of this.track.orbs) {
      if (o.taken) continue;
      const dz = ball.dist - o.s;
      if (Math.abs(dz) > 1.4) continue;
      const dx = ball.x - o.x;
      const dy = ball.y - o.y;
      if (dx * dx + dy * dy + dz * dz < 1.5) {
        o.taken = true;
        o.mesh.visible = false;
        this.orbCount++;
        this.sfx.orb();
      }
    }
  }

  _updateCamera(dt) {
    const ball = this.ball;
    const k = Math.min(1, dt * 4);
    const targetX = ball.x * 0.55;
    const targetY = ball.y + CAM_HEIGHT;
    this.camera.position.x += (targetX - this.camera.position.x) * k;
    this.camera.position.y += (targetY - this.camera.position.y) * k;
    this.camera.position.z = -ball.dist + CAM_BACK;
    this._lookX = (this._lookX ?? 0) + (ball.x * 0.4 - (this._lookX ?? 0)) * k;
    this.camera.lookAt(this._lookX, ball.y + 0.5, -ball.dist - LOOK_AHEAD);
  }

  _animateDecor(dt) {
    for (const o of this.track.orbs) {
      if (!o.taken) o.mesh.rotation.y += dt * 2.5;
    }
    if (this.stars) this.stars.position.z = -this.ball.dist;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// ---------------------------------------------------------------------------
// Procedural textures (canvas-based, so no image files are needed).
// ---------------------------------------------------------------------------
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#222f5e';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(120,200,255,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.strokeStyle = 'rgba(120,200,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.lineTo(64, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05070f');
  grad.addColorStop(0.45, '#101a44');
  grad.addColorStop(0.75, '#2a2f6b');
  grad.addColorStop(1, '#3a2a66');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
