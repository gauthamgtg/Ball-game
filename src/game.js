import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TrackManager, BALL_R } from './track.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';

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
  constructor(canvas, settings, callbacks = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.cb = callbacks;
    this.sfx = new Sfx();
    this.music = new Music();
    this.input = new Input(12);
    this.state = 'ready';
    this.quality = settings.get('quality');

    this.invuln = 0;
    this.shake = 0;

    this._initRenderer();
    this._initScene();
    this._initBall();
    this._initTrail();
    this._initParticles();
    this._initPost();

    this.track = new TrackManager(this.scene, this._roadTexture);

    this.setQuality(this.quality);
    this.sfx.sfxOn = settings.get('sfxOn');

    this._clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------------------
  _initRenderer() {
    // Antialiasing can only be chosen at context creation, so derive it from
    // the saved quality up front. Everything else is adjusted live.
    const aa = this.quality !== 'low';
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: aa,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Proper colour management + filmic tone mapping for richer neon.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this._skyTexture = makeSkyTexture();
    this.scene.background = this._skyTexture;
    this.scene.fog = new THREE.Fog(0x141a3a, 60, 200);

    this._roadTexture = makeRoadTexture();

    const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x202a55, 0.9);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(-8, 22, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const cam = dir.shadow.camera;
    cam.near = 1;
    cam.far = 80;
    cam.left = -20;
    cam.right = 20;
    cam.top = 20;
    cam.bottom = -20;
    dir.shadow.bias = -0.0008;
    this.scene.add(dir);
    this.scene.add(dir.target);
    this.dirLight = dir;

    // Light that travels with the ball for a glowing-orb feel.
    this.ballLight = new THREE.PointLight(0x6fdcff, 1.4, 30, 2);
    this.scene.add(this.ballLight);

    this._addStars();

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);
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
    const geo = new THREE.SphereGeometry(BALL_R, 48, 32);
    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.6,
      roughness: 0.18,
      emissive: 0x2bd4ff,
      emissiveIntensity: 0.4,
    });
    this.ballMesh = new THREE.Mesh(geo, this.ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    // A subtle equator stripe so rotation reads clearly.
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0xff3b81,
      emissive: 0xff3b81,
      emissiveIntensity: 0.7,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_R + 0.005, 0.07, 10, 40),
      this.ringMat
    );
    this.ballMesh.add(ring);

    this._special = null;
    this._hue = 0;
    this.ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
  }

  // Apply an equipped skin (see skins.js) to the ball + trail.
  setSkin(skin) {
    this.ballMat.color.setHex(skin.color);
    this.ballMat.emissive.setHex(skin.emissive);
    this.ballMat.emissiveIntensity = skin.emissiveIntensity;
    this.ballMat.metalness = skin.metalness;
    this.ballMat.roughness = skin.roughness;
    this.ringMat.color.setHex(skin.ring);
    this.ringMat.emissive.setHex(skin.ring);
    this._special = skin.special || null;
    if (this._trailColor) this._trailColor.setHex(skin.emissive);
    if (this.ballLight) this.ballLight.color.setHex(skin.emissive);
  }

  // Comet-style fading trail behind the ball (looks great under bloom).
  _initTrail() {
    this.trailN = 46;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailCol = new Float32Array(this.trailN * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.trail = new THREE.Points(geo, mat);
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this._trailColor = new THREE.Color(0x36e0ff);
  }

  resetTrail() {
    const { x, y, dist } = this.ball;
    for (let i = 0; i < this.trailN; i++) {
      this.trailPos[i * 3] = x;
      this.trailPos[i * 3 + 1] = y;
      this.trailPos[i * 3 + 2] = -dist;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  _updateTrail() {
    const p = this.trailPos;
    const c = this.trailCol;
    const n = this.trailN;
    for (let i = n - 1; i > 0; i--) {
      p[i * 3] = p[(i - 1) * 3];
      p[i * 3 + 1] = p[(i - 1) * 3 + 1];
      p[i * 3 + 2] = p[(i - 1) * 3 + 2];
    }
    p[0] = this.ball.x;
    p[1] = this.ball.y;
    p[2] = -this.ball.dist;
    const col = this._trailColor;
    for (let i = 0; i < n; i++) {
      const f = (1 - i / n) ** 1.5;
      c[i * 3] = col.r * f;
      c[i * 3 + 1] = col.g * f;
      c[i * 3 + 2] = col.b * f;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }

  // Pooled additive particles for orb pickups and the death burst.
  _initParticles() {
    this.pMax = 200;
    this.pPos = new Float32Array(this.pMax * 3);
    this.pVel = new Float32Array(this.pMax * 3);
    this.pCol = new Float32Array(this.pMax * 3);
    this.pLife = new Float32Array(this.pMax);
    this.pHead = 0;
    for (let i = 0; i < this.pMax; i++) this.pPos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this._pc = new THREE.Color();
  }

  emitBurst(x, y, z, hex, count, speed) {
    this._pc.setHex(hex);
    for (let k = 0; k < count; k++) {
      const i = this.pHead;
      this.pHead = (this.pHead + 1) % this.pMax;
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const sp = speed * (0.5 + Math.random());
      this.pPos[i * 3] = x;
      this.pPos[i * 3 + 1] = y;
      this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = dir.x * sp;
      this.pVel[i * 3 + 1] = dir.y * sp + 1.5;
      this.pVel[i * 3 + 2] = dir.z * sp;
      this.pCol[i * 3] = this._pc.r;
      this.pCol[i * 3 + 1] = this._pc.g;
      this.pCol[i * 3 + 2] = this._pc.b;
      this.pLife[i] = 0.6 + Math.random() * 0.4;
    }
  }

  _updateParticles(dt) {
    const p = this.pPos;
    const v = this.pVel;
    const c = this.pCol;
    let any = false;
    for (let i = 0; i < this.pMax; i++) {
      if (this.pLife[i] <= 0) continue;
      any = true;
      this.pLife[i] -= dt;
      v[i * 3 + 1] -= 9 * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      c[i * 3] *= 0.96;
      c[i * 3 + 1] *= 0.96;
      c[i * 3 + 2] *= 0.96;
      if (this.pLife[i] <= 0) p[i * 3 + 1] = -9999;
    }
    if (any) {
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.color.needsUpdate = true;
    }
  }

  _initPost() {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.8, 0.55, 0.55);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null; // gracefully fall back to direct rendering
    }
  }

  // -- audio / settings -----------------------------------------------------
  // Called on the first user gesture to unlock audio and start music.
  ensureAudio() {
    this.sfx.resume();
    if (this.sfx.ctx) this.music.init(this.sfx.ctx);
    this.applyAudioSettings();
  }

  applyAudioSettings() {
    this.sfx.sfxOn = this.settings.get('sfxOn');
    if (this.settings.get('musicOn')) this.music.start();
    else this.music.stop();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.scene.fog.near = 40;
      this.scene.fog.far = 140;
      if (this.stars) this.stars.visible = false;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.scene.fog.near = 55;
      this.scene.fog.far = 180;
      if (this.stars) this.stars.visible = true;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.scene.fog.near = 60;
      this.scene.fog.far = 210;
      if (this.stars) this.stars.visible = true;
    }
    if (this.dirLight) this.dirLight.castShadow = this.renderer.shadowMap.enabled;

    // Bloom is the centrepiece of the look; scale it back on low-end.
    this.bloomEnabled = q !== 'low' && !!this.composer;
    if (this.bloom) this.bloom.strength = q === 'high' ? 0.85 : 0.6;
    if (this.particles) this.particles.visible = q !== 'low';
  }

  // -------------------------------------------------------------------------
  start() {
    this.ensureAudio();
    this.track.reset();
    this.input.reset();
    this.ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
    this.orbCount = 0;
    this.prevDist = 0;
    this.invuln = 0;
    this.shake = 0;
    this._lookX = 0;
    this.ballMesh.rotation.set(0, 0, 0);
    this.ballMesh.visible = true;
    this.resetTrail();
    this.state = 'playing';
  }

  // Revive after death: relocate to safe ground, clear nearby hazards, and
  // grant brief invulnerability. Distance/score carry over.
  continueRun() {
    // Scan forward for solid ground (the current area is already generated).
    let s = this.ball.dist + 2;
    for (let i = 0; i < 500; i++) {
      const a = this.track.sample(s);
      const b = this.track.sample(s + 3.5);
      if (a.hasGround && b.hasGround) break;
      s += 2;
    }
    // Generate around the new spot (this also recycles only behind s - BEHIND,
    // so the ground under the ball is never removed).
    this.track.update(s);
    const g = this.track.sample(s);
    this.ball.dist = s;
    this.ball.x = g.centerX;
    this.ball.y = g.groundY + BALL_R;
    this.ball.vy = 0;
    this.ball.grounded = true;
    this.prevDist = s;
    this.input.lateral = g.centerX;
    this._lookX = g.centerX * 0.4;

    // Clear lasers in the immediate restart zone so the revive is fair.
    this.track.lasers = this.track.lasers.filter((l) => {
      if (l.s > s - 3 && l.s < s + 40) {
        this.track.group.remove(l.mesh);
        l.mesh.geometry.dispose();
        return false;
      }
      return true;
    });

    this.invuln = 2.5;
    this.shake = 0;
    this.ballMesh.visible = true;
    this.resetTrail();
    this.state = 'playing';
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  // Stop play and return to a calm, non-playing state used as the menu
  // backdrop (ball visible and reset on the runway).
  toMenu() {
    this.state = 'ready';
    this.ball = { dist: 0, x: 0, y: BALL_R, vy: 0, grounded: true };
    this.track.reset();
    this.invuln = 0;
    this.shake = 0;
    this._lookX = 0;
    this.ballMesh.visible = true;
    this.ballMesh.rotation.set(0, 0, 0);
    this.resetTrail();
  }

  _die(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.sfx.death();
    this.shake = 0.6;
    this.emitBurst(this.ball.x, this.ball.y, -this.ball.dist, this._trailColor.getHex(), 60, 8);
    this.ballMesh.visible = false;
    const dist = Math.floor(this.ball.dist);
    this.cb.onGameOver?.(reason, dist, this.orbCount);
  }

  // -------------------------------------------------------------------------
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 0.05);
    if (this.state === 'playing') this._step(dt);
    this._updateParticles(dt);
    this._updateCamera(dt);
    this._animateDecor(dt);
    if (this.bloomEnabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _step(dt) {
    const ball = this.ball;
    this.prevDist = ball.dist;
    if (this.invuln > 0) this.invuln -= dt;

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

    this._checkLasers(ball);
    this._checkOrbs(ball);

    // rolling animation
    this.ballMesh.rotation.x -= (speed * dt) / BALL_R;
    this.ballMesh.position.set(ball.x, ball.y, -ball.dist);
    this.ballLight.position.set(ball.x, ball.y + 1.5, -ball.dist + 1);
    this._updateTrail();

    const speedFrac = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    this.cb.onUpdate?.(Math.floor(ball.dist), this.orbCount, speedFrac);
  }

  _checkLasers(ball) {
    if (this.invuln > 0) return; // brief grace after a continue
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
        this.emitBurst(o.x, o.y, -o.s, 0x36e0ff, 10, 4);
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

    // Speed-based FOV kick for a sense of velocity.
    const speed = Math.min(MAX_SPEED, BASE_SPEED + ball.dist * SPEED_PER_M);
    const speedFrac = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const targetFov = 62 + speedFrac * 8;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }

    // Camera shake on death.
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const m = this.shake * 0.9;
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
      this.camera.position.x += sx;
      this.camera.position.y += sy;
    }
    this.camera.lookAt(this._lookX + sx, ball.y + 0.5, -ball.dist - LOOK_AHEAD);

    // Keep the shadow-casting light (and its frustum) centred on the ball.
    if (this.dirLight && this.renderer.shadowMap.enabled) {
      this.dirLight.position.set(ball.x - 8, ball.y + 22, -ball.dist + 10);
      this.dirLight.target.position.set(ball.x, ball.y, -ball.dist - 6);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  _animateDecor(dt) {
    for (const o of this.track.orbs) {
      if (!o.taken) o.mesh.rotation.y += dt * 2.5;
    }
    if (this.stars) this.stars.position.z = -this.ball.dist;

    // Hue-cycling for the "Plasma" skin.
    if (this._special === 'rainbow') {
      this._hue = (this._hue + dt * 0.25) % 1;
      this.ballMat.emissive.setHSL(this._hue, 1, 0.55);
      this.ballMat.color.setHSL(this._hue, 0.6, 0.7);
      this.ringMat.emissive.setHSL((this._hue + 0.5) % 1, 1, 0.6);
      this._trailColor.setHSL(this._hue, 1, 0.6);
    }

    // Blink the ball while invulnerable after a continue.
    if (this.invuln > 0 && this.state === 'playing') {
      this.ballMesh.visible = Math.floor(this.invuln * 12) % 2 === 0;
    } else if (this.state === 'playing') {
      this.ballMesh.visible = true;
    }
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
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
  tex.colorSpace = THREE.SRGBColorSpace;
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
