// Game terrain textures made by tools/sprites/terrain.py (terrain.json + WebP).
// Each texture is a top-down square that repeats every `tiles` map tiles; the
// renderer projects it onto the isometric ground.

export class TerrainSet {
  static async load(baseUrl) {
    const res = await fetch(`${baseUrl}/terrain.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`terrain manifest: HTTP ${res.status}`);
    return new TerrainSet(await res.json(), baseUrl);
  }

  constructor(manifest, baseUrl) {
    this.m = manifest;
    this.base = baseUrl;
    this.images = new Map(); // texture name -> Promise<HTMLImageElement | null>
  }

  /** Texture name for a terrain id, or null. */
  textureOf(terrainId) {
    return this.m.terrains[terrainId] ?? null;
  }

  /**
   * Loads the textures of these terrain ids. Resolves to
   * Map<terrain id, { name, image, tiles }>; ids without a texture are left out.
   */
  async prepare(terrainIds) {
    const out = new Map();
    await Promise.all([...terrainIds].map(async (id) => {
      const name = this.textureOf(id);
      const entry = name && this.m.textures[name];
      if (!entry) return;
      const image = await this.#image(name, entry[0]);
      if (image) out.set(id, { name, image, tiles: entry[1] });
    }));
    return out;
  }

  #image(name, file) {
    let p = this.images.get(name);
    if (!p) {
      // Up to three tries: a flaky download should not leave the ground flat.
      const attempt = (left) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(left > 0
          ? new Promise((r) => setTimeout(r, 800)).then(() => attempt(left - 1))
          : null);
        img.src = `${this.base}/${file}`;
      });
      p = attempt(2);
      this.images.set(name, p);
    }
    return p;
  }
}
