// Game sprites from the atlases made by tools/sprites (manifest.json + WebP pages).
// Pages load on first use; until then (or if a sprite is missing) the renderer
// falls back to its own shapes. Player color comes from a mask that is tinted
// per color once and cached.
//
// Memory, not download size, is what breaks phones: a page takes width x height
// x 4 bytes once decoded. So below high quality the viewer uses half-size pages
// and one architecture for everyone, and pages not drawn for a while are
// released when the decoded total passes the quality's budget.

// Built town centers use a different id than the starting one.
const BUILDING_ALIASES = { 621: 109 };
const RETRIES = 4;
const IDLE_FRAMES = 30; // a page not drawn for this many frames can be released

export class SpriteSet {
  static async load(baseUrl) {
    // Revalidate every time: atlas names carry a content hash, the manifest does not.
    const res = await fetch(`${baseUrl}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`sprites manifest: HTTP ${res.status}`);
    return new SpriteSet(await res.json(), baseUrl);
  }

  /**
   * Fetches the sprite lists of these civilizations (civs/<id>.json), once each.
   * A match only needs its own civilizations; the rest stay on the server.
   */
  async loadCivs(civIds) {
    if (!Array.isArray(this.m.civs)) return; // older manifest: everything is inline
    await Promise.all([...new Set(civIds)].map((id) => this.#loadCiv(id)));
  }

  #loadCiv(id) {
    if (id == null || !this.m.civs.some((c) => String(c) === String(id))) return null;
    this.civLoads[id] ??= fetch(`${this.base}/civs/${id}.json`, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((civ) => {
        this.civs[id] = civ;
        this.onLoad?.();
      })
      .catch(() => {
        // Flaky network: allow another try a little later.
        setTimeout(() => delete this.civLoads[id], 2000);
      });
    return this.civLoads[id];
  }

  // A civilization's sprite lists; if not here yet, start fetching them (redraw on arrival).
  #civ(id) {
    const civ = this.civs[id];
    if (!civ && Array.isArray(this.m.civs)) this.#loadCiv(id);
    return civ;
  }

  constructor(manifest, baseUrl) {
    this.m = manifest;
    // Version 3 lists civilization ids and keeps their data in civs/<id>.json.
    this.civs = Array.isArray(manifest.civs) ? {} : manifest.civs;
    this.civLoads = {};
    this.base = baseUrl;
    this.tilePx = manifest.tilePx;
    this.pages = new Map(); // page index -> { base, mask, requested, loading, tints, used }
    this.onLoad = null;
    this.lowRes = false;
    this.sharedCiv = null;
    this.budget = Infinity; // decoded bytes kept
    this.clock = 0; // frames drawn, for least-recently-used release
  }

  /**
   * Quality settings: { lowRes, sharedCiv, atlasMB } (see quality.js). Changing
   * resolution drops every page: they are fetched again at the new size.
   */
  setQuality({ lowRes = false, sharedCiv = null, atlasMB = Infinity } = {}) {
    const low = lowRes && Array.isArray(this.m.pagesLow);
    if (low !== this.lowRes) {
      for (const index of [...this.pages.keys()]) this.#release(index);
      this.lowRes = low;
    }
    this.sharedCiv = sharedCiv;
    if (sharedCiv != null && Array.isArray(this.m.civs)) this.#loadCiv(sharedCiv);
    this.budget = atlasMB * 1024 * 1024;
  }

  /** Page images requested and not here yet (for a loading indicator). */
  get pending() {
    let n = 0;
    for (const page of this.pages.values()) n += page.loading.size;
    return n;
  }

  /** Decoded size of the loaded pages and their tints, in bytes (approximate). */
  get decodedBytes() {
    let total = 0;
    for (const page of this.pages.values()) total += this.#bytes(page);
    return total;
  }

  #bytes(page) {
    let total = 0;
    for (const img of [page.base, page.mask]) if (img) total += img.naturalWidth * img.naturalHeight * 4;
    for (const c of page.tints.values()) total += c.width * c.height * 4;
    return total;
  }

  /**
   * Call after drawing a frame: while the decoded total is over budget,
   * releases the pages not drawn lately, oldest first.
   */
  endFrame() {
    this.clock++;
    if (!Number.isFinite(this.budget) || this.clock % 10) return;
    let total = this.decodedBytes;
    if (total <= this.budget) return;
    const idle = [...this.pages.entries()]
      .filter(([, page]) => page.used < this.clock - IDLE_FRAMES)
      .sort((a, b) => a[1].used - b[1].used);
    for (const [index, page] of idle) {
      if (total <= this.budget) break;
      total -= this.#bytes(page);
      this.#release(index);
    }
  }

  #release(index) {
    const page = this.pages.get(index);
    if (!page) return;
    for (const img of [page.base, page.mask, ...page.loading]) {
      if (!img) continue;
      img.onload = img.onerror = null;
      img.removeAttribute('src');
    }
    this.pages.delete(index);
  }

  // Each image (base, mask) is requested the first time a frame needs it.
  // `files` is [base file, mask file or null], named with a content hash.
  #page(index, withMask) {
    let page = this.pages.get(index);
    if (!page) {
      page = { base: null, mask: null, requested: new Set(), loading: new Set(), tints: new Map(), used: 0 };
      this.pages.set(index, page);
    }
    page.used = this.clock;
    const [baseFile, maskFile] = (this.lowRes ? this.m.pagesLow : this.m.pages)[index];
    const load = (file, slot) => {
      if (!file || page.requested.has(slot)) return;
      page.requested.add(slot);
      const img = new Image();
      page.loading.add(img);
      img.onload = () => {
        page.loading.delete(img);
        page[slot] = img;
        this.onLoad?.();
      };
      // A failed download (flaky network) is retried on a later frame, a bit later each time.
      img.onerror = () => {
        page.loading.delete(img);
        const tries = (page.tries ?? 0) + 1;
        page.tries = tries;
        if (tries <= RETRIES) setTimeout(() => page.requested.delete(slot), 1000 * tries);
      };
      img.src = `${this.base}/${file}`;
    };
    load(baseFile, 'base');
    if (withMask) load(maskFile, 'mask');
    return page;
  }

  /**
   * A drawable frame (by manifest index), or null while its page is loading.
   * (sx, sy, sw, sh): source rectangle in the page image; (w, h, ax, ay): size
   * and anchor in full-size sprite pixels, whatever the page resolution.
   */
  frame(key) {
    const f = this.m.frames[key];
    if (!f) return null;
    const [p, x, y, w, h, ax, ay, m] = f;
    const page = this.#page(p, m === 1);
    if (!page.base || (m === 1 && !page.mask)) return null;
    const r = this.lowRes ? 0.5 : 1;
    return {
      sx: x * r, sy: y * r, sw: w * r, sh: h * r, w, h, ax, ay,
      image: page.base, mask: m === 1 ? page.mask : null, page,
    };
  }

  /** The frame's player-color layer tinted with `color` (cached with its page), or null. */
  tint(frame, key, color) {
    const id = `${key}|${color}`;
    let canvas = frame.page.tints.get(id);
    if (!canvas) {
      const w = Math.max(1, Math.ceil(frame.sw));
      const h = Math.max(1, Math.ceil(frame.sh));
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null; // out of canvas memory: the sprite is drawn untinted
      ctx.drawImage(frame.mask, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(frame.mask, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      frame.page.tints.set(id, canvas);
    }
    return canvas;
  }

  /** [[frame index, dx, dy], ...] for a building of a civilization at an age (1-4). */
  building(civId, typeId, age) {
    const id = BUILDING_ALIASES[typeId] ?? typeId;
    // Below high quality everyone shares one architecture (tinted per player);
    // buildings it does not have (unique ones) keep the owner's own.
    const ages = (this.sharedCiv != null && this.#civ(this.sharedCiv)?.buildings?.[id])
      || this.#civ(civId)?.buildings?.[id];
    if (!ages) return null;
    for (let a = age; a >= 1; a--) if (ages[a]) return ages[a];
    return null;
  }

  /** Rubble left by a building of a civilization at an age, or null. */
  rubble(civId, typeId, age) {
    const ages = this.#civ(civId)?.rubble?.[BUILDING_ALIASES[typeId] ?? typeId];
    if (!ages) return null;
    for (let a = age; a >= 1; a--) if (ages[a] != null) return ages[a];
    return null;
  }

  /** { idle: [key per angle], walk: [[keys per angle]], attack: [[keys per angle]] } */
  unit(civId, typeId) {
    return this.#civ(civId)?.units?.[typeId] ?? null;
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
