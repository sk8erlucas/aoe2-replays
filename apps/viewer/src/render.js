// Canvas renderer: draws a Replay state. Swap this file to change the look
// (sprites, isometric view) without touching the engine.

import { ANIMAL_COLOR, PLAYER_COLORS, RESOURCE_COLORS, TERRAIN_COLORS } from './palette.js';

const GAIA_COLOR = ANIMAL_COLOR;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Renderer {
  constructor(canvas, replay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.replay = replay;
    this.size = replay.data.map.size;
    this.view = { x: this.size / 2, y: this.size / 2, scale: 4 };
    this.base = this.#buildBaseLayer();
  }

  playerColor(number) {
    const p = this.replay.playerByNumber.get(number);
    return p ? PLAYER_COLORS[p.color_id] ?? '#ffffff' : GAIA_COLOR;
  }

  // One pixel per tile: terrain shaded by elevation, plus static resources.
  #buildBaseLayer() {
    const { size } = this;
    const { terrain, elevation } = this.replay.data.map;
    const legend = this.replay.legend.terrain ?? {};
    const layer = document.createElement('canvas');
    layer.width = size;
    layer.height = size;
    const ctx = layer.getContext('2d');
    const img = ctx.createImageData(size, size);
    const cache = new Map();
    for (let i = 0; i < size * size; i++) {
      const id = terrain[i];
      if (!cache.has(id)) {
        cache.set(id, hexToRgb(TERRAIN_COLORS[legend[id]?.category] ?? TERRAIN_COLORS.grass));
      }
      const [r, g, b] = cache.get(id);
      const light = 1 + (elevation[i] ?? 0) * 0.05;
      img.data.set([Math.min(255, r * light), Math.min(255, g * light), Math.min(255, b * light), 255], i * 4);
    }
    for (const res of this.replay.resources) {
      const x = Math.floor(res.x);
      const y = Math.floor(res.y);
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const color = RESOURCE_COLORS[res.category];
      if (color) img.data.set([...hexToRgb(color), 255], (y * size + x) * 4);
    }
    ctx.putImageData(img, 0, 0);
    return layer;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
  }

  fit() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.view = { x: this.size / 2, y: this.size / 2, scale: Math.min(w, h) / this.size };
  }

  // World (tile) coordinates to CSS pixels and back.
  toScreen(x, y) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return [(x - this.view.x) * this.view.scale + w / 2, (y - this.view.y) * this.view.scale + h / 2];
  }

  toWorld(sx, sy) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    return [(sx - w / 2) / this.view.scale + this.view.x, (sy - h / 2) / this.view.scale + this.view.y];
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.view.scale = Math.min(64, Math.max(1, this.view.scale * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.view.x += wx - nx;
    this.view.y += wy - ny;
  }

  pan(dx, dy) {
    this.view.x -= dx / this.view.scale;
    this.view.y -= dy / this.view.scale;
  }

  draw(state) {
    const { ctx, view } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    const [ox, oy] = this.toScreen(0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, ox, oy, this.size * view.scale, this.size * view.scale);

    for (const { building, progress } of state.buildings) this.#drawBuilding(building, progress, state);
    for (const u of state.units) if (u.moving && u.unit.player > 0) this.#drawPath(u, state);
    for (const u of state.units) this.#drawUnit(u, state);
  }

  #alpha(player, state) {
    return state.resigned.has(player) ? 0.35 : 1;
  }

  #drawBuilding(b, progress, state) {
    const { ctx } = this;
    const s = this.view.scale;
    const [x, y] = this.toScreen(b.x - b.size / 2, b.y - b.size / 2);
    const w = b.size * s;
    ctx.globalAlpha = this.#alpha(b.player, state);
    ctx.fillStyle = this.playerColor(b.player);
    if (progress >= 1) {
      ctx.fillRect(x, y, w, w);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, s / 8);
      ctx.strokeRect(x, y, w, w);
    } else {
      // Foundation: outline plus a bar that fills with progress.
      ctx.globalAlpha *= 0.45;
      ctx.fillRect(x, y + w * (1 - progress), w, w * progress);
      ctx.globalAlpha = this.#alpha(b.player, state);
      ctx.strokeStyle = this.playerColor(b.player);
      ctx.lineWidth = Math.max(1, s / 6);
      ctx.setLineDash([Math.max(2, s / 2), Math.max(2, s / 2)]);
      ctx.strokeRect(x, y, w, w);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  #drawPath(u, state) {
    const { ctx } = this;
    const [x1, y1] = this.toScreen(u.x, u.y);
    const [x2, y2] = this.toScreen(u.target.x, u.target.y);
    ctx.globalAlpha = 0.5 * this.#alpha(u.unit.player, state);
    ctx.strokeStyle = this.playerColor(u.unit.player);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  #drawUnit(u, state) {
    const { ctx } = this;
    const s = this.view.scale;
    const gaia = u.unit.player === 0;
    const r = Math.max(1.5, s * (gaia ? 0.3 : 0.4));
    const [x, y] = this.toScreen(u.x, u.y);
    ctx.globalAlpha = this.#alpha(u.unit.player, state) * (u.unit.approx ? 0.8 : 1);
    ctx.fillStyle = this.playerColor(u.unit.player);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (s >= 3) {
      ctx.strokeStyle = u.unit.approx ? '#fff' : '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  // What is under the cursor: a unit first, then a building.
  pick(state, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    const hitUnit = state.units.find((u) => Math.abs(u.x - wx) < 0.6 && Math.abs(u.y - wy) < 0.6);
    if (hitUnit) return { kind: 'unit', ...hitUnit };
    const hitBuilding = state.buildings.find(({ building: b }) =>
      Math.abs(b.x - wx) <= b.size / 2 && Math.abs(b.y - wy) <= b.size / 2);
    if (hitBuilding) return { kind: 'building', ...hitBuilding };
    return null;
  }
}
