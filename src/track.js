import * as THREE from 'three';

// ---------------------------------------------------------------------------
// World constants. "s" is forward distance travelled (always increasing).
// Geometry is placed at worldZ = -s so the ball rolls into the screen.
// ---------------------------------------------------------------------------
export const ROAD_HALF = 3.2; // half width of the road
export const BALL_R = 0.5;

const AHEAD = 220; // how far ahead of the ball we keep generating track
const BEHIND = 40; // how far behind the ball we keep old segments

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t); // smoothstep
const rand = (a, b) => a + Math.random() * (b - a);

// A laser colour palette for variety.
const LASER_COLOR = 0xff3b6b;
const ORB_COLOR = 0x36e0ff;

export class TrackManager {
  constructor(scene, roadTexture) {
    this.scene = scene;
    this.roadTexture = roadTexture;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      color: 0x2a3b73,
      metalness: 0.25,
      roughness: 0.65,
    });
    this.edgeMat = new THREE.MeshStandardMaterial({
      color: 0x36e0ff,
      emissive: 0x1e9fd0,
      emissiveIntensity: 0.9,
      metalness: 0.4,
      roughness: 0.3,
    });

    this.segments = [];
    this.lasers = [];
    this.orbs = [];
    this.ramps = [];
    this.reset();
  }

  reset() {
    for (const seg of this.segments) this._disposeSeg(seg);
    this.segments.length = 0;
    this.lasers.length = 0;
    this.orbs.length = 0;
    this.ramps.length = 0;

    this.cursorS = 0;
    this.curX = 0;
    this.curY = 0;

    // A generous, obstacle-free runway so the player can settle in.
    this._pushSegment({ type: 'flat', len: 70, safe: true });
    while (this.cursorS < AHEAD) this._generateNext(0);
  }

  // -- difficulty 0..1 derived from distance ------------------------------
  _difficulty(ballDist) {
    return clamp(ballDist / 2200, 0, 1);
  }

  update(ballDist) {
    const diff = this._difficulty(ballDist);
    while (this.cursorS < ballDist + AHEAD) this._generateNext(diff);

    // Recycle segments / obstacles that are well behind the ball.
    const cutoff = ballDist - BEHIND;
    while (this.segments.length && this.segments[0].s1 < cutoff) {
      this._disposeSeg(this.segments.shift());
    }
    this.lasers = this.lasers.filter((l) => {
      if (l.s1 < cutoff) {
        this.group.remove(l.mesh);
        l.mesh.geometry.dispose();
        return false;
      }
      return true;
    });
    this.orbs = this.orbs.filter((o) => {
      if (o.s < cutoff || o.taken) {
        this.group.remove(o.mesh);
        return false;
      }
      return true;
    });
    this.ramps = this.ramps.filter((r) => r.s >= cutoff);
  }

  // -- sample the road surface at forward distance s ----------------------
  sample(s) {
    const seg = this._segAt(s);
    if (!seg) return { hasGround: false, groundY: 0, centerX: 0, half: ROAD_HALF };
    const t = clamp((s - seg.s0) / (seg.s1 - seg.s0), 0, 1);
    const e = seg.linear ? t : smooth(t);
    const centerX = lerp(seg.x0, seg.x1, e);
    const groundY = lerp(seg.y0, seg.y1, e);
    let hasGround = true;
    if (seg.gap && s > seg.gap.g0 && s < seg.gap.g1) hasGround = false;
    return { hasGround, groundY, centerX, half: ROAD_HALF };
  }

  _segAt(s) {
    for (const seg of this.segments) {
      if (s >= seg.s0 && s < seg.s1) return seg;
    }
    // Past the last generated segment: clamp to nearest for safety.
    const last = this.segments[this.segments.length - 1];
    return last && s >= last.s1 ? last : null;
  }

  // -----------------------------------------------------------------------
  // Procedural generation
  // -----------------------------------------------------------------------
  _generateNext(diff) {
    const r = Math.random();
    let type;
    // Weight obstacle types by difficulty.
    if (r < 0.34) type = 'flat';
    else if (r < 0.56) type = 'curve';
    else if (r < 0.74) type = 'hill';
    else if (r < 0.88) type = 'gap';
    else type = 'ramp';

    if (type === 'flat') this._pushSegment({ type: 'flat', len: rand(26, 38), diff });
    else if (type === 'curve') this._pushSegment({ type: 'curve', len: rand(30, 46), diff });
    else if (type === 'hill') this._pushSegment({ type: 'hill', len: rand(28, 40), diff });
    else if (type === 'gap') this._pushSegment({ type: 'gap', len: rand(30, 44), diff });
    else this._pushRamp(diff);
  }

  _pushRamp(diff) {
    // A ramp climbs, flings the ball off the lip across a gap, then a down-ramp
    // brings the track back to its previous height.
    const rise = rand(2.6, 3.6);
    const up = this._pushSegment({ type: 'ramp', len: rand(8, 11), rise, linear: true });
    // Launch impulse sized so the gap below is clearable even at low speed.
    this.ramps.push({ s: up.s1, vy: 13.5 });
    this._pushSegment({
      type: 'gap',
      len: rand(24, 32),
      diff,
      forceGap: rand(6, 9),
      gapAtStart: true,
    });
    this._pushSegment({ type: 'ramp', len: rand(12, 16), rise: -rise, linear: true });
  }

  _pushSegment(opts) {
    const { type, len } = opts;
    const diff = opts.diff || 0;
    const s0 = this.cursorS;
    const s1 = s0 + len;
    const x0 = this.curX;
    const y0 = this.curY;
    let x1 = x0;
    let y1 = y0;
    let gap = null;

    if (type === 'curve') {
      const amp = lerp(2.5, 7, diff);
      x1 = clamp(x0 + rand(-amp, amp), -12, 12);
    } else if (type === 'hill') {
      y1 = y0 + rand(-3.2, 3.2);
    } else if (type === 'ramp') {
      y1 = y0 + (opts.rise || 3);
    } else if (type === 'gap') {
      // A gap the player must jump (or fly) across, kept clearable.
      const gapLen = opts.forceGap || lerp(3.5, 8, diff);
      if (opts.gapAtStart) {
        const g0 = s0 + 0.8;
        gap = { g0, g1: g0 + gapLen };
      } else {
        const mid = (s0 + s1) / 2;
        gap = { g0: mid - gapLen / 2, g1: mid + gapLen / 2 };
      }
    }

    const seg = { type, s0, s1, x0, x1, y0, y1, gap, linear: !!opts.linear, safe: !!opts.safe };
    this._buildSegmentMesh(seg);
    this.segments.push(seg);

    // Obstacles & collectibles (never on the opening runway).
    if (!opts.safe) {
      if (type === 'flat' || type === 'curve' || type === 'hill') {
        this._maybeAddLasers(seg, diff);
      }
      this._maybeAddOrbs(seg);
    }

    this.cursorS = s1;
    this.curX = x1;
    this.curY = y1;
    return seg;
  }

  // -- road mesh (a ribbon following the curve / incline) -----------------
  _buildSegmentMesh(seg) {
    const STEP = 1.5;
    const steps = Math.max(2, Math.round((seg.s1 - seg.s0) / STEP));
    const positions = [];
    const uvs = [];
    const indices = [];
    const vLen = (seg.s1 - seg.s0) / 4;

    let vert = 0;
    const ring = []; // index of left/right verts per step, or null in a gap
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = lerp(seg.s0, seg.s1, t);
      const inGap = seg.gap && s > seg.gap.g0 && s < seg.gap.g1;
      if (inGap) {
        ring.push(null);
        continue;
      }
      const e = seg.linear ? t : smooth(t);
      const cx = lerp(seg.x0, seg.x1, e);
      const gy = lerp(seg.y0, seg.y1, e);
      const z = -s;
      positions.push(cx - ROAD_HALF, gy, z, cx + ROAD_HALF, gy, z);
      uvs.push(0, t * vLen, 1, t * vLen);
      ring.push(vert);
      vert += 2;
    }
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (a == null || b == null) continue; // skip across gaps
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.roadMat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    seg.roadMesh = mesh;

    this._buildEdges(seg, steps);
  }

  // Glowing rails along both edges of the road.
  _buildEdges(seg, steps) {
    const makeRail = (side) => {
      const positions = [];
      const indices = [];
      const w = 0.18;
      const h = 0.28;
      let vert = 0;
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const s = lerp(seg.s0, seg.s1, t);
        if (seg.gap && s > seg.gap.g0 && s < seg.gap.g1) {
          prev = null;
          continue;
        }
        const e = seg.linear ? t : smooth(t);
        const cx = lerp(seg.x0, seg.x1, e);
        const gy = lerp(seg.y0, seg.y1, e);
        const ex = cx + side * ROAD_HALF;
        const z = -s;
        // four verts of the rail cross-section
        positions.push(ex - w, gy, z, ex + w, gy, z, ex - w, gy + h, z, ex + w, gy + h, z);
        const base = vert;
        if (prev != null) {
          // connect previous ring (top faces + outer/inner sides)
          indices.push(prev + 2, prev + 3, base + 2, base + 2, prev + 3, base + 3);
        }
        prev = base;
        vert += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.edgeMat);
      this.group.add(mesh);
      return mesh;
    };
    seg.railL = makeRail(-1);
    seg.railR = makeRail(1);
  }

  // -- laser obstacles -----------------------------------------------------
  _maybeAddLasers(seg, diff) {
    const chance = lerp(0.25, 0.8, diff);
    if (Math.random() > chance) return;
    const count = Math.random() < diff * 0.5 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const t = rand(0.25, 0.85);
      const s = lerp(seg.s0, seg.s1, t);
      if (seg.gap && s > seg.gap.g0 - 4 && s < seg.gap.g1 + 4) continue;
      const cx = lerp(seg.x0, seg.x1, smooth(t));
      const gy = lerp(seg.y0, seg.y1, smooth(t));

      // Either a full-width low beam (jump it) or a side beam (steer around).
      const mode = Math.random();
      let xMin, xMax;
      if (mode < 0.55) {
        xMin = cx - ROAD_HALF;
        xMax = cx + ROAD_HALF;
      } else if (mode < 0.78) {
        xMin = cx - ROAD_HALF;
        xMax = cx + rand(-0.4, 0.6);
      } else {
        xMin = cx + rand(-0.6, 0.4);
        xMax = cx + ROAD_HALF;
      }
      const full = xMax - xMin > ROAD_HALF * 1.6;
      const h = full ? 1.15 : 1.7; // full-width beams sit low so a jump clears
      this._spawnLaser(s, xMin, xMax, gy, h);
    }
  }

  _spawnLaser(s, xMin, xMax, groundY, h) {
    const width = xMax - xMin;
    const cx = (xMin + xMax) / 2;
    const geo = new THREE.BoxGeometry(width, 0.16, 0.16);
    const mat = new THREE.MeshStandardMaterial({
      color: LASER_COLOR,
      emissive: LASER_COLOR,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, groundY + h, -s);
    this.group.add(mesh);
    this.lasers.push({ s, s1: s, xMin, xMax, y: groundY + h, h, groundY, mesh });
  }

  // -- collectible orbs ----------------------------------------------------
  _maybeAddOrbs(seg) {
    if (Math.random() > 0.55) return;
    const n = Math.floor(rand(3, 7));
    const tStart = rand(0.1, 0.5);
    for (let i = 0; i < n; i++) {
      const t = tStart + i * 0.06;
      if (t > 0.95) break;
      const s = lerp(seg.s0, seg.s1, t);
      if (seg.gap && s > seg.gap.g0 && s < seg.gap.g1) continue;
      const cx = lerp(seg.x0, seg.x1, smooth(t));
      const gy = lerp(seg.y0, seg.y1, smooth(t));
      this._spawnOrb(s, cx, gy + 1.0);
    }
  }

  _spawnOrb(s, x, y) {
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: ORB_COLOR,
      emissive: ORB_COLOR,
      emissiveIntensity: 1.1,
      metalness: 0.5,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, -s);
    this.group.add(mesh);
    this.orbs.push({ s, x, y, mesh, taken: false });
  }

  _disposeSeg(seg) {
    for (const m of [seg.roadMesh, seg.railL, seg.railR]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
  }
}
