// Isometric canvas renderer and camera. Swap the draw* methods for sprites
// later without touching the camera or the engine.
//
// Projection (2:1 isometric): a tile is 2 units wide and 1 unit tall.
//   u = x - y            (screen right)
//   v = (x + y) / 2 - z  (screen down; z = ground height)

import { ANIMAL_COLOR, PLAYER_COLORS, RESOURCE_COLORS, TERRAIN_COLORS } from './palette.js';

const ELEVATION_UNITS = 0.25; // height of one elevation level
// Unit class (game data) -> a common unit whose sprite stands in for units
// without their own, such as civilization unique units.
// What a villager is doing (engine activity) -> job animation in the sprites.
const VILLAGER_JOBS = {
  tree: 'lumberjack', gold: 'miner_gold', stone: 'miner_stone', berries: 'forager', build: 'builder', farm: 'farmer',
};
const VILLAGER_TYPES = new Set([83, 293]);

const CLASS_STAND_IN = {
  0: 4, // archer
  4: 83, // civilian
  6: 74, // infantry
  12: 38, // cavalry
  13: 280, // siege weapon
  18: 125, // monk
  36: 39, // cavalry archer
  44: 5, // hand cannoneer
  47: 448, // scout cavalry
};
const CLOSE_TILE_PX = 64; // tile width on screen at the default close zoom
const MAX_TILE_PX = 160;
const DETAIL_SCALE = 5; // from this scale on, trees and resources are drawn as objects
const AUTO_HOLD_MS = 4000; // auto camera keeps a target at least this long (game time)
const CAMERA_SPEED = 4; // higher = snappier camera
// Close-up ground is drawn in square chunks at the zoom's resolution and cached.
const CHUNK_PX = 512;
const MAX_CHUNKS = 64;
const MAX_CHUNK_K = 32; // px per unit; beyond this chunks are scaled up
const CHUNKS_PER_FRAME = 2; // render budget, so zooming never stalls a frame
const FARM_TERRAIN = 7; // the game's farm ground ("Farm1"), drawn under farm buildings
const CANOPY_RGB = [38, 66, 30]; // forest seen from afar, where trees are not drawn

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
    this.sprites = null;
    this.facing = new WeakMap(); // unit -> last screen direction index
    this.textures = null; // terrain id -> { name, image, tiles }
    this.scaledTextures = new Map(); // `${name}:${texels per tile}` -> canvas
    this.chunks = new Map(); // `${k}:${cu}:${cv}` -> canvas, oldest first
    this.pending = false; // chunks still to render: ask for another frame
  }

  /**
   * Game terrain textures (TerrainSet). Resolves once the map's textures are
   * loaded and the ground is rebuilt with them; redraw then.
   */
  async setTerrain(terrainSet) {
    if (!terrainSet) return;
    const textures = await terrainSet.prepare(new Set([...this.replay.data.map.terrain, FARM_TERRAIN]));
    if (!textures.size) return;
    this.textures = textures;
    this.farmPattern = null;
    this.scaledTextures.clear();
    this.chunks.clear();
    this.base = this.#buildBaseLayer();
  }

  /** Game sprites (SpriteSet) to draw with; null keeps the plain shapes. */
  setSprites(sprites) {
    this.sprites = sprites;
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
    const { size: n, k } = this;
    const layer = document.createElement('canvas');
    layer.width = 2 * n * k;
    layer.height = Math.ceil((n + this.elevPad + 1) * k);
    // Zoomed out trees are not drawn, so forests get a canopy colour.
    this.#paintTerrain(layer.getContext('2d'), k, -n, -this.elevPad, 2 * n, n + this.elevPad + 1, true);
    return layer;
  }

  // Texture resampled to `texels` per tile side, so patterns never alias.
  #scaledTexture(tex, texels) {
    const key = `${tex.name}:${texels}`;
    let canvas = this.scaledTextures.get(key);
    if (!canvas) {
      const side = tex.tiles * texels;
      canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tex.image, 0, 0, side, side);
      this.scaledTextures.set(key, canvas);
    }
    return canvas;
  }

  /**
   * Paints the ground inside a (u, v) rectangle into ctx at k px per unit:
   * canvas point = ((u - u0) * k, (v - v0) * k).
   */
  #paintTerrain(ctx, k, u0, v0, uw, vh, canopy = false) {
    const { size: n, elevation: elev } = this;
    const { terrain } = this.replay.data.map;
    const legend = this.replay.legend.terrain ?? {};
    const e = (x, y) => elev[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))] ?? 0;
    // Texels per tile side close to the screen's, at most the texture's own.
    const texels = Math.min(32, 2 ** Math.max(1, Math.ceil(Math.log2(k * 1.12))));
    const fills = new Map(); // terrain id -> { pattern, unit, z } or { color }
    const fillFor = (id) => {
      let f = fills.get(id);
      if (f === undefined) {
        const tex = this.textures?.get(id);
        if (tex) {
          f = { pattern: ctx.createPattern(this.#scaledTexture(tex, texels), 'repeat'), unit: 1 / texels, z: null };
        } else {
          f = { color: hexToRgb(TERRAIN_COLORS[legend[id]?.category] ?? TERRAIN_COLORS.grass) };
        }
        fills.set(id, f);
      }
      return f;
    };
    const px = (u) => (u - u0) * k;
    const py = (v) => (v - v0) * k;
    const diamond = (path, x, y, z) => {
      path.moveTo(px(x - y), py((x + y) / 2 - z)); // top
      path.lineTo(px(x + 1 - y), py((x + 1 + y) / 2 - z)); // right
      path.lineTo(px(x - y), py((x + y + 2) / 2 - z)); // bottom
      path.lineTo(px(x - y - 1), py((x + y + 1) / 2 - z)); // left
      path.closePath();
    };
    ctx.lineWidth = 1;

    // Tiles whose diamond can reach the rectangle (raised tiles reach higher),
    // one diagonal row at a time, back to front, so nearer tiles cover the ones
    // behind them. Within a row, tiles that look the same go in one path: a few
    // fills per row instead of one per tile.
    const dMin = Math.max(0, Math.floor(2 * v0) - 2);
    const dMax = Math.min(2 * n - 2, Math.ceil(2 * (v0 + vh + this.elevPad)) + 2);
    for (let d = dMin; d <= dMax; d++) {
      const ground = new Map(); // look -> { path, style | f + z }
      const overlay = new Map(); // light and canopy, painted over the ground
      const add = (layer, key, init, x, y, z) => {
        let g = layer.get(key);
        if (!g) layer.set(key, (g = { path: new Path2D(), ...init() }));
        diamond(g.path, x, y, z);
      };
      const xMin = Math.max(0, d - n + 1, Math.ceil((d + u0 - 1) / 2));
      const xMax = Math.min(d, n - 1, Math.floor((d + u0 + uw + 1) / 2));
      for (let x = xMin; x <= xMax; x++) {
        const y = d - x;
        const i = y * n + x;
        const id = terrain[i];
        const ez = e(x, y);
        const z = ez * ELEVATION_UNITS;
        // Light comes from the top of the screen: slopes facing it are brighter.
        const slope = (e(x - 1, y) + e(x, y - 1) - e(x + 1, y) - e(x, y + 1)) / 2;
        const f = fillFor(id);
        if (!f.pattern) {
          const q = Math.round((1 + ez * 0.03 + slope * 0.09 + (hash(i) - 0.5) * 0.07) * 50) / 50;
          add(ground, `${id}|${q}`, () => ({ style: shade(f.color, q) }), x, y, z);
          continue;
        }
        add(ground, `${id}|${z}`, () => ({ f, z }), x, y, z);
        if (canopy && legend[id]?.category === 'forest') {
          const q = Math.round((0.85 + hash(i) * 0.4 + slope * 0.09) * 20) / 20;
          add(overlay, `c${q}`, () => ({ style: shade(CANOPY_RGB, q), stroke: true }), x, y, z);
          continue;
        }
        const light = Math.round((ez * 0.03 + slope * 0.09) * 100) / 100;
        if (light !== 0) {
          add(overlay, `l${light}`, () => ({
            style: light > 0 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${-light})`,
          }), x, y, z);
        }
      }
      for (const g of ground.values()) {
        let style = g.style;
        if (g.f) {
          if (g.f.z !== g.z) {
            // Texture space (texels) -> world tiles -> this canvas.
            const a = k * g.f.unit;
            g.f.pattern.setTransform(new DOMMatrix([a, a / 2, -a, a / 2, -u0 * k, -(g.z + v0) * k]));
            g.f.z = g.z;
          }
          style = g.f.pattern;
        }
        ctx.fillStyle = style;
        ctx.strokeStyle = style; // hides seams between diamonds
        ctx.fill(g.path);
        ctx.stroke(g.path);
      }
      for (const g of overlay.values()) {
        ctx.fillStyle = g.style;
        ctx.fill(g.path);
        if (g.stroke) {
          ctx.strokeStyle = g.style;
          ctx.stroke(g.path);
        }
      }
    }
  }

  // Close up, the base layer is too coarse: draw cached chunks at the zoom's resolution.
  #drawGroundDetail() {
    this.pending = false;
    if (!this.textures) return;
    const scale = this.cam.scale;
    const devicePx = scale * this.dpr;
    if (devicePx <= this.k * 1.5) return;
    const k = Math.min(MAX_CHUNK_K, 2 ** Math.ceil(Math.log2(devicePx)));
    const span = CHUNK_PX / k; // (u, v) units per chunk
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const uA = this.cam.u - w / 2 / scale;
    const uB = this.cam.u + w / 2 / scale;
    const vA = this.cam.v - h / 2 / scale;
    const vB = this.cam.v + h / 2 / scale;
    let budget = CHUNKS_PER_FRAME;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    for (let cv = Math.floor(vA / span); cv <= Math.floor(vB / span); cv++) {
      for (let cu = Math.floor(uA / span); cu <= Math.floor(uB / span); cu++) {
        const key = `${k}:${cu}:${cv}`;
        let chunk = this.chunks.get(key);
        if (chunk) {
          this.chunks.delete(key); // re-inserted below: most recently used goes last
        } else if (budget > 0) {
          budget--;
          chunk = document.createElement('canvas');
          chunk.width = CHUNK_PX;
          chunk.height = CHUNK_PX;
          this.#paintTerrain(chunk.getContext('2d'), k, cu * span, cv * span, span, span);
        } else {
          this.pending = true; // the base layer shows through until it is drawn
          continue;
        }
        this.chunks.set(key, chunk);
        // Snap edges to whole pixels so neighbouring chunks never leave a gap.
        const [x0, y0] = this.uvToScreen(cu * span, cv * span);
        const [x1, y1] = this.uvToScreen((cu + 1) * span, (cv + 1) * span);
        const sx = Math.floor(x0);
        const sy = Math.floor(y0);
        ctx.drawImage(chunk, sx, sy, Math.ceil(x1) - sx, Math.ceil(y1) - sy);
      }
    }
    while (this.chunks.size > MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value);
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
    return moved || this.pending;
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
    ctx.imageSmoothingEnabled = !!this.textures;
    ctx.drawImage(this.base, bx, by, (this.base.width / this.k) * s, (this.base.height / this.k) * s);
    this.#drawGroundDetail();

    const b = this.#visibleBounds();
    const inView = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    const detail = s >= DETAIL_SCALE;

    // Painter's algorithm: everything that stands up is sorted by depth.
    const items = [];
    for (const r of this.replay.resources) {
      if (!inView(r.x, r.y)) continue;
      const gone = r.depletedAt <= state.t;
      if (r.category === 'tree' && !detail) continue; // forest terrain already reads as forest
      if (gone && r.category !== 'tree') continue;
      items.push({ depth: r.x + r.y, draw: () => (gone ? this.#drawStump(r) : this.#drawResource(r, detail)) });
    }
    for (const it of state.buildings) {
      const bd = it.building;
      if (!inView(bd.x, bd.y)) continue;
      // Farms lie flat on the ground: under everything that stands on them.
      const flat = this.replay.objectName(bd.typeId) === 'Farm';
      items.push({ depth: flat ? -Infinity : bd.x + bd.y + bd.size / 2, draw: () => this.#drawBuilding(bd, it.progress, state) });
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
    if (detail && this.sprites && this.#spriteResource(r)) return;
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

  // A felled tree leaves a stump.
  #drawStump(r) {
    const { ctx } = this;
    const s = this.cam.scale;
    const [x, y] = this.toScreen(r.x, r.y);
    ctx.fillStyle = '#4a321c';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.06, s * 0.12, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b08a5a';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.1, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawBuilding(b, progress, state) {
    if (this.sprites && this.cam.scale >= DETAIL_SCALE && this.#spriteBuilding(b, progress, state)) return;
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

    if (this.replay.objectName(b.typeId) === 'Farm') {
      // Farms are flat plots: tilled soil with a player-colored border.
      const soil = this.#farmFill(z);
      if (soil && progress < 1) ctx.globalAlpha *= 0.4 + progress * 0.6;
      poly([top, right, bottom, left], soil ?? (progress < 1 ? '#8a6a3c' : '#9c7a3c'));
      ctx.globalAlpha = this.#alpha(b.player, state);
      ctx.strokeStyle = this.playerColor(b.player);
      ctx.lineWidth = Math.max(1, s / 16);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,20,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < (soil ? 0 : 4); i++) {
        const k = i / 4;
        const a1 = [top[0] + (left[0] - top[0]) * k, top[1] + (left[1] - top[1]) * k];
        const a2 = [right[0] + (bottom[0] - right[0]) * k, right[1] + (bottom[1] - right[1]) * k];
        ctx.beginPath();
        ctx.moveTo(a1[0], a1[1]);
        ctx.lineTo(a2[0], a2[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

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

  // The game's farm texture, laid on the ground in screen space (null if not loaded).
  #farmFill(z) {
    const tex = this.textures?.get(FARM_TERRAIN);
    if (!tex) return null;
    this.farmPattern ??= this.ctx.createPattern(this.#scaledTexture(tex, 32), 'repeat');
    const s = this.cam.scale;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const a = s / 32;
    this.farmPattern.setTransform(new DOMMatrix([a, a / 2, -a, a / 2, w / 2 - this.cam.u * s, h / 2 - (z + this.cam.v) * s]));
    return this.farmPattern;
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
    if (detail && this.sprites && this.#spriteUnit(u, state)) return;
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

  // ---------- sprites ----------

  // Draws one atlas frame with its anchor on screen point (sx, sy).
  // (ox, oy): extra offset in sprite pixels, used by sub-graphics such as walls.
  #blit(key, sx, sy, color, ox = 0, oy = 0) {
    const f = this.sprites.frame(key);
    if (!f) return false;
    const k = (2 * this.cam.scale) / this.sprites.tilePx;
    const x = sx + (ox - f.ax) * k;
    const y = sy + (oy - f.ay) * k;
    const w = f.w * k;
    const h = f.h * k;
    this.ctx.drawImage(f.image, f.x, f.y, f.w, f.h, x, y, w, h);
    if (f.mask && color) this.ctx.drawImage(this.sprites.tint(f, key, color), x, y, w, h);
    return true;
  }

  #civ(player) {
    return this.replay.playerByNumber.get(player)?.civilization_id;
  }

  #spriteBuilding(b, progress, state) {
    const civ = this.#civ(b.player);
    const parts = civ != null && this.sprites.building(civ, b.typeId, this.replay.ageAt(b.player, state.t));
    if (!parts) return false;
    // The sprite exists but its atlas is still downloading: draw nothing rather
    // than a placeholder box that would flash and look broken.
    if (parts.some(([key]) => !this.sprites.frame(key))) return true;
    const color = this.playerColor(b.player);
    // Foundations show the finished building faded until construction ends.
    this.ctx.globalAlpha = this.#alpha(b.player, state) * (progress < 1 ? 0.4 + progress * 0.3 : 1);
    for (const [key, dx, dy, ox = 0, oy = 0] of parts) {
      const [sx, sy] = this.toScreen(b.x + dx, b.y + dy);
      this.#blit(key, sx, sy, color, ox, oy);
    }
    this.ctx.globalAlpha = 1;
    return true;
  }

  // Screen direction as one of `count` angles like the game's sprites: 0 = facing right, turning clockwise.
  #angleIndex(unit, u, count) {
    const seg = unit.segmentAt(u.t ?? 0);
    const dx = (seg.x1 - seg.x0) - (seg.y1 - seg.y0);
    const dy = (seg.x1 - seg.x0 + seg.y1 - seg.y0) / 2;
    if (Math.abs(dx) + Math.abs(dy) > 1e-3) {
      const a = Math.atan2(dy, dx); // screen y grows downward, so this turns clockwise
      const idx = ((Math.round((a / (2 * Math.PI)) * count) % count) + count) % count;
      this.facing.set(unit, idx / count);
    }
    return Math.round((this.facing.get(unit) ?? 0) * count) % count;
  }

  #spriteUnit(u, state) {
    const unit = u.unit;
    const color = unit.player > 0 ? this.playerColor(unit.player) : null;
    const [sx, sy] = this.toScreen(u.x, u.y);
    this.ctx.globalAlpha = this.#alpha(unit.player, state);
    let ok = false;
    if (unit.player === 0) {
      const keys = this.sprites.gaia(unit.typeId);
      if (keys?.length) ok = this.#blit(keys[this.#angleIndex(unit, { t: state.t }, keys.length)], sx, sy, null);
    } else {
      const civ = this.#civ(unit.player);
      const job = this.#villagerJob(unit, state.t);
      if (job) {
        const anim = u.moving ? job.walk : job.task;
        if (anim) {
          const frames = anim[this.#angleIndex(unit, { t: state.t }, anim.length)];
          ok = this.#blit(frames[Math.floor(state.t / (u.moving ? 110 : 160)) % frames.length], sx, sy, color);
          this.ctx.globalAlpha = 1;
          if (ok) return true;
        }
      }
      const unitClass = this.replay.game?.units?.[unit.typeId]?.class;
      const set = this.sprites.unit(civ, unit.typeId ?? 83)
        ?? this.sprites.unit(civ, CLASS_STAND_IN[unitClass] ?? 74)
        ?? this.sprites.unit(civ, 83);
      if (set) {
        if (u.moving && set.walk) {
          const frames = set.walk[this.#angleIndex(unit, { t: state.t }, set.walk.length)];
          ok = this.#blit(frames[Math.floor(state.t / 110) % frames.length], sx, sy, color);
        } else if (set.idle) {
          ok = this.#blit(set.idle[this.#angleIndex(unit, { t: state.t }, set.idle.length)], sx, sy, color);
        }
      }
    }
    this.ctx.globalAlpha = 1;
    return ok;
  }

  #villagerJob(unit, t) {
    if (unit.typeId != null && !VILLAGER_TYPES.has(unit.typeId)) return null;
    const kind = unit.activityAt(t);
    const role = kind && VILLAGER_JOBS[kind];
    return role ? this.sprites.villager(unit.typeId === 293 ? 'female' : 'male', role) : null;
  }

  #spriteResource(r) {
    const keys = this.sprites.gaia(r.type_id);
    if (!keys?.length) return false;
    const [sx, sy] = this.toScreen(r.x, r.y);
    return this.#blit(keys[Math.floor(hash(r.id) * keys.length)], sx, sy, null);
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
