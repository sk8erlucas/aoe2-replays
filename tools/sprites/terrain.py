"""Extracts the game's terrain textures for the viewer.

  .venv/Scripts/python terrain.py --game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE" \
      --out ../../apps/web/public/sprites

Writes terrain/<texture>.<hash>.webp and terrain.json:
  {"tilePx": 32, "textures": {"g_grs": ["terrain/g_grs.<hash>.webp", 16, "#5f8a33"]},
   "terrains": {"0": "g_grs", ...}}
Each texture is a top-down square that repeats every N tiles (second field);
the colour is its average, for the zoomed-out map before textures load.
Which texture each terrain id uses comes from the game data file.
"""

import argparse
import json
from pathlib import Path

from PIL import Image

from extract import load_dat, save_hashed

# Game textures (2x) have 128 texels per tile side; we keep 32, enough for the
# viewer's closest zoom.
GAME_TEXELS_PER_TILE = 128
TEXELS_PER_TILE = 32


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()

    tex_dir = args.game / 'resources/_common/terrain/textures/2x'
    out_dir = args.out / 'terrain'
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.webp'):
        old.unlink()

    dat = load_dat(args.game, Path(__file__).with_name('.dat-cache.pkl'))
    terrains, textures = {}, {}
    for tid, t in enumerate(dat.terrain_block.terrains):
        name = (t.name_2 or '').strip()
        if not t.enabled or not name.startswith('g_'):
            continue
        src = tex_dir / f'{name}.dds'
        if not src.exists():
            continue
        if name not in textures:
            img = Image.open(src).convert('RGB')
            tiles = max(1, img.width // GAME_TEXELS_PER_TILE)
            img = img.resize((tiles * TEXELS_PER_TILE, tiles * TEXELS_PER_TILE), Image.LANCZOS)
            r, g, b = img.resize((1, 1), Image.BOX).getpixel((0, 0))
            file = save_hashed(img, out_dir, name, args.quality)
            textures[name] = [f'terrain/{file}', tiles, f'#{r:02x}{g:02x}{b:02x}']
        terrains[str(tid)] = name

    manifest = {'tilePx': TEXELS_PER_TILE, 'textures': textures, 'terrains': terrains}
    (args.out / 'terrain.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    size = sum(f.stat().st_size for f in out_dir.glob('*.webp'))
    print(f'{len(terrains)} terrains, {len(textures)} textures, {size // 1024} KB')


if __name__ == '__main__':
    main()
