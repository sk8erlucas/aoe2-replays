// Isometric canvas renderer and camera. Swap the draw* methods for sprites
// later without touching the camera or the engine.
//
// Projection (2:1 isometric): a tile is 2 units wide and 1 unit tall.
//   u = x - y            (screen right)
//   v = (x + y) / 2 - z  (screen down; z = ground height)

import { ANIMAL_COLOR, PLAYER_COLORS, RESOURCE_COLORS, TERRAIN_COLORS } from './palette.js';

const ELEVATION_UNITS = 0.25; // height of one elevation level
const CLOSE_TILE_PX = 64; // tile width on screen at the default close zoom
const MAX_TILE_PX = 160;
const DETAIL_SCALE = 5; // from this scale on, trees and resources are drawn as objects
const AUTO_HOLD_MS = 4000; // auto camera keeps a target at least this long (game time)
const CAMERA_SPEED = 4; // higher = snappier camera

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade([r, g, b], k) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Deterministic per-object noise in [0, 1).
function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas, replay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.replay = replay;
    const { size, elevation } = replay.data.map;
    this.size = size;
    this.elevation = elevation;
    this.maxElevation = elevation.reduce((m, e) => Math.max(m, e), 0);
    this.k = Math.max(2, Math.min(8, Math.floor(8192 / (2 * size)))); // base layer px per unit
    this.elevPad = this.maxElevation * ELEVATION_UNITS;
    this.base = this.#buildBaseLayer();
    this.dpr = 1;
    this.cam = { u: 0, v: size / 2, scale: 8 };
    this.target = { ...this.cam };
    this.follow = 'auto';
    this.autoFocus = null;
  }

  // ---------- geometry ----------

  heightAt(x, y) {
    const n = this.size;
    const xi = Math.min(n - 1, Math.max(0, Math.floor(x)));
    const yi = Math.min(n - 1, Math.max(0, Math.floor(y)));
    return (this.elevation[yi * n + xi] ?? 0) * ELEVATION_UNITS;
  }

  uv(x, y, z = this.heightAt(x, y)) {
    return [x - y, (x + y) / 2 - z];
  }

  uvToScreen(u, v) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return [(u - this.cam.u) * this.cam.scale + w / 2, (v - this.cam.v) * this.cam.scale + h / 2];
  }

  toScreen(x, y, z) {
    const [u, v] = this.uv(x, y, z);
    return this.uvToScreen(u, v);
  }

  /** Screen point to ground tile coordinates (ignores elevation). */
  toWorld(sx, sy) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const u = (sx - w / 2) / this.cam.scale + this.cam.u;
    const v = (sy - h / 2) / this.cam.scale + this.cam.v;
    return [v + u / 2, v - u / 2];
  }

  // ---------- base layer ----------

  #buildBaseLayer() {
    const { size: n, k, elevation: elev } = this;
    const { terrain } = this.replay.data.map;
    const legend = this.replay.legend.terrain ?? {};
    const layer = document.createElement('canvas');
    layer.width = 2 * n * k;
    layer.height = Math.ceil((n + this.elevPad + 1) * k);
    const ctx = layer.getContext('2d');
    const rgb = new Map();
    const e = (x, y) => elev[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))] ?? 0;

    // Back to front so nearer (raised) tiles cover the ones behind them.
    for (let d = 0; d <= 2 * n - 2; d++) {
      for (let x = Math.max(0, d - n + 1); x <= Math.min(d, n - 1); x++) {
        const y = d - x;
        const i = y * n + x;
        const id = terrain[i];
        if (!rgb.has(id)) rgb.set(id, hexToRgb(TERRAIN_COLORS[legend[id]?.category] ?? TERRAIN_COLORS.grass));
        // Light comes from the top of the screen: slopes facing it are brighter.
        const slope = (e(x - 1, y) + e(x, y - 1) - e(x + 1, y) - e(x, y + 1)) / 2;
        const light = 1 + e(x, y) * 0.03 + slope * 0.09 + (hash(i) - 0.5) * 0.07;
        const z = e(x, y) * ELEVATION_UNITS;
        const px = (u) => (u + n) * k;
        const py = (v) => (v + this.elevPad) * k;
        ctx.beginPath();
        ctx.moveTo(px(x - y), py((x + y) / 2 - z)); // top
        ctx.lineTo(px(x + 1 - y), py((x + 1 + y) / 2 - z)); // right
        ctx.lineTo(px(x - y), py((x + y + 2) / 2 - z)); // bottom
        ctx.lineTo(px(x - y - 1), py((x + y + 1) / 2 - z)); // left
        ctx.closePath();
        const color = shade(rgb.get(id), light);
        ctx.fillStyle = color;
        ctx.strokeStyle = color; // hides seams between diamonds
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    }
    return layer;
  }

  // ---------- camera ----------

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
  }

  get minScale() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return Math.min(w / (2 * this.size), h / (this.size + this.elevPad)) * 0.95;
  }

  get maxScale() {
    return MAX_TILE_PX / 2;
  }

  /** Whole map in view. */
  fit() {
    this.follow = null;
    this.target = { u: 0, v: this.size / 2 - this.elevPad / 2, scale: this.minScale };
  }

  /** Close zoom on a tile, like in-game. `instant` skips the camera glide. */
  centerOn(x, y, { scale = this.target.scale, instant = false } = {}) {
    const [u, v] = this.uv(x, y);
    this.target = { u, v, scale: Math.min(this.maxScale, Math.max(this.minScale, scale)) };
    if (instant) this.cam = { ...this.target };
  }

  closeScale() {
    return CLOSE_TILE_PX / 2;
  }

  /** null (free), 'auto', or a player number. */
  setFollow(mode) {
    this.follow = mode;
    this.autoFocus = null;
  }

  zoomAt(sx, sy, factor) {
    const scale = Math.min(this.maxScale, Math.max(this.minScale, this.target.scale * factor));
    const { clientWidth: w, clientHeight: h } = this.canvas;
    // Keep the point under the cursor fixed, unless the camera is following something.
    if (this.follow == null) {
      const u = (sx - w / 2) / this.cam.scale + this.cam.u;
      const v = (sy - h / 2) / this.cam.scale + this.cam.v;
      this.target.u = u - (sx - w / 2) / scale;
      this.target.v = v - (sy - h / 2) / scale;
      this.cam.u = this.target.u;
      this.cam.v = this.target.v;
    }
    this.target.scale = scale;
    this.cam.scale = scale;
  }

  pan(dx, dy) {
    this.follow = null;
    this.cam.u -= dx / this.cam.scale;
    this.cam.v -= dy / this.cam.scale;
    this.target.u = this.cam.u;
    this.target.v = this.cam.v;
  }

  /** Move the camera toward its target. dtMs is real time; t is game time. */
  update(dtMs, t) {
    if (this.follow === 'auto') {
      const latest = this.replay.latestFocus(t);
      const held = this.autoFocus && t - this.autoFocus.since < AUTO_HOLD_MS && t >= this.autoFocus.since;
      if (latest && !held && latest.t !== this.autoFocus?.t) {
        this.autoFocus = { ...latest, since: t };
      }
      const f = this.autoFocus ?? this.replay.focusOf(this.replay.players[0]?.number, t);
      if (f) this.#aim(f.x, f.y);
    } else if (typeof this.follow === 'number') {
      const f = this.replay.focusOf(this.follow, t);
      this.#aim(f.x, f.y);
    }
    const a = 1 - Math.exp((-CAMERA_SPEED * dtMs) / 1000);
    const moved = Math.abs(this.cam.u - this.target.u) + Math.abs(this.cam.v - this.target.v) > 0.01
      || Math.abs(this.cam.scale - this.target.scale) > 0.01;
    this.cam.u += (this.target.u - this.cam.u) * a;
    this.cam.v += (this.target.v - this.cam.v) * a;
    this.cam.scale += (this.target.scale - this.cam.scale) * a;
    return moved;
  }

  #aim(x, y) {
    const [u, v] = this.uv(x, y);
    this.target.u = u;
    this.target.v = v;
  }

  // ---------- drawing ----------

  playerColor(number) {
    const p = this.replay.playerByNumber.get(number);
    return p ? PLAYER_COLORS[p.color_id] ?? '#ffffff' : ANIMAL_COLOR;
  }

  #visibleBounds(margin = 4) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([sx, sy]) => this.toWorld(sx, sy));
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return {
      x0: Math.min(...xs) - margin, x1: Math.max(...xs) + margin + this.elevPad * 2,
      y0: Math.min(...ys) - margin, y1: Math.max(...ys) + margin + this.elevPad * 2,
    };
  }

  draw(state) {
    const { ctx } = this;
    const s = this.cam.scale;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0c0d';
    ctx.fillRect(0, 0, w, h);

    const [bx, by] = this.uvToScreen(-this.size, -this.elevPad);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, bx, by, (this.base.width / this.k) * s, (this.base.height / this.k) * s);

    const b = this.#visibleBounds();
    const inView = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    const detail = s >= DETAIL_SCALE;

    // Painter's algorithm: everything that stands up is sorted by depth.
    const items = [];
    for (const r of this.replay.resources) {
      if (!inView(r.x, r.y)) continue;
      if (r.category === 'tree' && !detail) continue; // forest terrain already reads as forest
      items.push({ depth: r.x + r.y, draw: () => this.#drawResource(r, detail) });
    }
    for (const it of state.buildings) {
      const bd = it.building;
      if (!inView(bd.x, bd.y)) continue;
      items.push({ depth: bd.x + bd.y + bd.size / 2, draw: () => this.#drawBuilding(bd, it.progress, state) });
    }
    for (const u of state.units) {
      if (!inView(u.x, u.y)) continue;
      items.push({ depth: u.x + u.y, draw: () => this.#drawUnit(u, state, detail) });
    }
    items.sort((a, z) => a.depth - z.depth);

    // Orders on the ground, under everything else.
    for (const u of state.units) {
      if (u.moving && u.unit.player > 0 && inView(u.x, u.y)) this.#drawPath(u, state);
    }
    for (const it of items) it.draw();
    ctx.globalAlpha = 1;
  }

  #alpha(player, state) {
    return state.resigned.has(player) ? 0.4 : 1;
  }

  #drawResource(r, detail) {
    const { ctx } = this;
    const s = this.cam.scale;
    const [x, y] = this.toScreen(r.x, r.y);
    const n = hash(r.id);
    if (!detail) {
      ctx.fillStyle = RESOURCE_COLORS[r.category] ?? '#fff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      return;
    }
    if (r.category === 'tree') {
      const hgt = s * (1.5 + n * 0.6);
      const rad = s * (0.42 + n * 0.12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, rad * 0.9, rad * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(x - s * 0.06, y - hgt * 0.45, s * 0.12, hgt * 0.45);
      ctx.fillStyle = n > 0.5 ? '#24502a' : '#2c5a2c';
      ctx.beginPath();
      ctx.arc(x, y - hgt * 0.62, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(x - rad * 0.3, y - hgt * 0.62 - rad * 0.3, rad * 0.45, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const color = RESOURCE_COLORS[r.category] ?? '#fff';
    if (r.category === 'berries') {
      ctx.fillStyle = '#2f6b2a';
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.2, s * 0.45, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        const a = n * 6 + i * 1.3;
        ctx.fillRect(x + Math.cos(a) * s * 0.28 - 1.5, y - s * 0.2 + Math.sin(a) * s * 0.15 - 1.5, 3, 3);
      }
      return;
    }
    // Gold, stone, relic: a small faceted pile.
    const rgb = hexToRgb(color);
    const pw = s * (r.category === 'relic' ? 0.25 : 0.5);
    const ph = s * (r.category === 'relic' ? 0.3 : 0.45);
    ctx.fillStyle = shade(rgb, 0.75);
    ctx.beginPath();
    ctx.moveTo(x - pw, y);
    ctx.lineTo(x, y - ph);
    ctx.lineTo(x, y + pw * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(rgb, 1.1);
    ctx.beginPath();
    ctx.moveTo(x + pw, y);
    ctx.lineTo(x, y - ph);
    ctx.lineTo(x, y + pw * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  #drawBuilding(b, progress, state) {
    const { ctx } = this;
    const s = this.cam.scale;
    const half = b.size / 2;
    const wall = b.size <= 1;
    const z = this.heightAt(b.x, b.y);
    const body = (wall ? 0.7 : 0.5 + b.size * 0.3) * Math.max(0.08, progress);
    const roof = wall || progress < 1 ? 0 : b.size * 0.28;
    const rgb = hexToRgb(this.playerColor(b.player));
    const P = (x, y, up = 0) => this.toScreen(x, y, z + up);
    const top = P(b.x - half, b.y - half);
    const right = P(b.x + half, b.y - half);
    const bottom = P(b.x + half, b.y + half);
    const left = P(b.x - half, b.y + half);
    const lift = body * s;
    const poly = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    const up = ([x, y], dy) => [x, y - dy];

    ctx.globalAlpha = this.#alpha(b.player, state);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, s / 24);

    if (progress < 1) {
      // Foundation outline on the ground.
      ctx.setLineDash([Math.max(2, s / 4), Math.max(2, s / 4)]);
      poly([top, right, bottom, left], 'rgba(255,255,255,0.08)');
      ctx.setLineDash([]);
    }
    poly([left, bottom, up(bottom, lift), up(left, lift)], shade(rgb, 0.8)); // front-left wall
    poly([bottom, right, up(right, lift), up(bottom, lift)], shade(rgb, 0.6)); // front-right wall
    const t2 = up(top, lift);
    const r2 = up(right, lift);
    const b2 = up(bottom, lift);
    const l2 = up(left, lift);
    if (roof > 0) {
      const apex = up(P(b.x, b.y), lift + roof * s);
      poly([l2, b2, apex], shade(rgb, 0.95));
      poly([b2, r2, apex], shade(rgb, 0.7));
      poly([t2, l2, apex], shade(rgb, 1.15));
      poly([r2, t2, apex], shade(rgb, 0.85));
    } else {
      poly([t2, r2, b2, l2], shade(rgb, 1.1));
    }
    ctx.globalAlpha = 1;
  }

  #drawPath(u, state) {
    const { ctx } = this;
    const [x1, y1] = this.toScreen(u.x, u.y);
    const [x2, y2] = this.toScreen(u.target.x, u.target.y);
    ctx.globalAlpha = 0.45 * this.#alpha(u.unit.player, state);
    ctx.strokeStyle = this.playerColor(u.unit.player);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  #drawUnit(u, state, detail) {
    const { ctx } = this;
    const s = this.cam.scale;
    const [x, y] = this.toScreen(u.x, u.y);
    const gaia = u.unit.player === 0;
    const color = this.playerColor(u.unit.player);
    ctx.globalAlpha = this.#alpha(u.unit.player, state);
    if (!detail) {
      const r = gaia ? 1.5 : 2.5;
      ctx.fillStyle = color;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = u.unit.approx ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(1, s / 32);
    if (gaia) {
      // Animal: horizontal body and a head.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.22, s * 0.3, s * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.28, y - s * 0.32, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    // Person: body and head.
    const hgt = s * 0.85;
    const bw = s * 0.32;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - hgt, bw, hgt * 0.75, bw / 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2c49b';
    ctx.beginPath();
    ctx.arc(x, y - hgt - s * 0.08, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------- minimap ----------

  /** Draws the whole map, units and the current view into another canvas. */
  drawMinimap(canvas, state) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const m = this.#minimapScale(w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, m.ox, m.oy, this.base.width * (m.s / this.k), this.base.height * (m.s / this.k));
    const dot = (x, y, color, r) => {
      const [u, v] = this.uv(x, y);
      ctx.fillStyle = color;
      ctx.fillRect(m.ox + (u + this.size) * m.s - r, m.oy + (v + this.elevPad) * m.s - r, r * 2, r * 2);
    };
    for (const it of state.buildings) dot(it.building.x, it.building.y, this.playerColor(it.building.player), 2);
    for (const u of state.units) if (u.unit.player > 0) dot(u.x, u.y, this.playerColor(u.unit.player), 1);

    // Current view rectangle.
    const { clientWidth: cw, clientHeight: ch } = this.canvas;
    const vw = (cw / this.cam.scale) * m.s;
    const vh = (ch / this.cam.scale) * m.s;
    const cx = m.ox + (this.cam.u + this.size) * m.s;
    const cy = m.oy + (this.cam.v + this.elevPad) * m.s;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - vw / 2, cy - vh / 2, vw, vh);
  }

  #minimapScale(w, h) {
    const mapW = 2 * this.size;
    const mapH = this.size + this.elevPad + 1;
    const s = Math.min(w / mapW, h / mapH);
    return { s, ox: (w - mapW * s) / 2, oy: (h - mapH * s) / 2 };
  }

  /** Minimap point (CSS px) to tile coordinates. */
  minimapToWorld(canvas, mx, my) {
    const m = this.#minimapScale(canvas.clientWidth, canvas.clientHeight);
    const u = (mx - m.ox) / m.s - this.size;
    const v = (my - m.oy) / m.s - this.elevPad;
    return [v + u / 2, v - u / 2];
  }

  // ---------- picking ----------

  /** What is under the cursor: a unit first, then a building. */
  pick(state, sx, sy) {
    const s = this.cam.scale;
    const reach = Math.max(8, s * 0.5);
    let best = null;
    for (const u of state.units) {
      const [x, y] = this.toScreen(u.x, u.y);
      const d = Math.hypot(x - sx, y - s * 0.45 - sy);
      if (d < reach && (!best || d < best.d)) best = { d, u };
    }
    if (best) return { kind: 'unit', ...best.u };
    const [wx, wy] = this.toWorld(sx, sy);
    const hit = state.buildings.find(({ building: b }) =>
      Math.abs(b.x - wx) <= b.size / 2 + 0.5 && Math.abs(b.y - wy) <= b.size / 2 + 0.5);
    return hit ? { kind: 'building', ...hit } : null;
  }
}
