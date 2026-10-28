// Game sprites from the atlases made by tools/sprites (manifest.json + WebP pages).
// Pages load on first use; until then (or if a sprite is missing) the renderer
// falls back to its own shapes. Player color comes from a mask that is tinted
// per color once and cached.

// Built town centers use a different id than the starting one.
const BUILDING_ALIASES = { 621: 109 };

export class SpriteSet {
  static async load(baseUrl) {
    const res = await fetch(`${baseUrl}/manifest.json`);
    if (!res.ok) throw new Error(`sprites manifest: HTTP ${res.status}`);
    return new SpriteSet(await res.json(), baseUrl);
  }

  constructor(manifest, baseUrl) {
    this.m = manifest;
    this.base = baseUrl;
    this.tilePx = manifest.tilePx;
    this.pages = new Map();
    this.tints = new Map();
    this.onLoad = null;
  }

  // Each image (base, mask) is requested the first time a frame needs it.
  #page(name, withMask) {
    let page = this.pages.get(name);
    if (!page) {
      page = { base: null, mask: null, requested: new Set() };
      this.pages.set(name, page);
    }
    const load = (suffix, slot) => {
      if (page.requested.has(slot)) return;
      page.requested.add(slot);
      const img = new Image();
      img.onload = () => {
        page[slot] = img;
        this.onLoad?.();
      };
      img.src = `${this.base}/${name}${suffix}.webp`;
    };
    load('', 'base');
    if (withMask) load('-mask', 'mask');
    return page;
  }

  /** A drawable frame (by manifest index), or null while its page is loading. */
  frame(key) {
    const f = this.m.frames[key];
    if (!f) return null;
    const [p, x, y, w, h, ax, ay, m] = f;
    const page = this.#page(this.m.pages[p], m === 1);
    if (!page.base || (m === 1 && !page.mask)) return null;
    return { x, y, w, h, ax, ay, image: page.base, mask: m === 1 ? page.mask : null };
  }

  /** The frame's player-color layer tinted with `color` (cached). */
  tint(frame, key, color) {
    const id = `${key}|${color}`;
    let canvas = this.tints.get(id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = frame.w;
      canvas.height = frame.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(frame.mask, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, frame.w, frame.h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(frame.mask, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      this.tints.set(id, canvas);
    }
    return canvas;
  }

  /** [[frame index, dx, dy], ...] for a building of a civilization at an age (1-4). */
  building(civId, typeId, age) {
    const ages = this.m.civs[civId]?.buildings?.[BUILDING_ALIASES[typeId] ?? typeId];
    if (!ages) return null;
    for (let a = age; a >= 1; a--) if (ages[a]) return ages[a];
    return null;
  }

  /** { idle: [key per angle], walk: [[keys per angle]] } */
  unit(civId, typeId) {
    return this.m.civs[civId]?.units?.[typeId] ?? null;
  }

  /** Villager job animations: { task: [[keys per angle]], walk: [[keys per angle]] }. */
  villager(sex, role) {
    return this.m.villagers?.[sex]?.[role] ?? null;
  }

  /** Keys for a gaia object (tree variants, animal angles, a mine). */
  gaia(typeId) {
    return this.m.gaia[typeId] ?? null;
  }
}
