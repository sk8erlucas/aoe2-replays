"""Research icons of the game (widgetui/textures/ingame/tech/NNN_name.dds) in one
WebP atlas for the viewer's research panel: tech-icons.webp + tech-icons.json
({ size, cols, techs: { tech id: cell } }). NNN is the tech's icon_id in the
game's data file. Ages use their own icons (age-N.png).

    .venv/Scripts/python techicons.py --game "<game folder>" --out ../../apps/web/public/sprites
"""

import argparse
import json
import re
from pathlib import Path

from PIL import Image

SIZE = 48  # px per icon; the panel shows them at 24-32 CSS px
AGES = {101: 2, 102: 3, 103: 4}  # Feudal, Castle, Imperial: age-N.png


def build(dat, game: Path, out: Path):
    folder = game / 'widgetui/textures/ingame'
    files = {}
    for f in (folder / 'tech').iterdir():
        m = re.match(r'(\d+)_', f.name)
        if m:
            files[int(m.group(1))] = f
    cells, images, techs = {}, [], {}
    for tech_id, tech in enumerate(dat.techs):
        if not any(r.location_id >= 0 for r in tech.research_locations):
            continue
        source = folder / f'icons/age-{AGES[tech_id]}.png' if tech_id in AGES else files.get(tech.icon_id)
        if source is None or not source.exists():
            continue
        if source not in cells:
            cells[source] = len(images)
            images.append(Image.open(source).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS))
        techs[tech_id] = cells[source]
    cols = 20
    rows = (len(images) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * SIZE, rows * SIZE))
    for i, im in enumerate(images):
        atlas.paste(im, ((i % cols) * SIZE, (i // cols) * SIZE))
    atlas.save(out / 'tech-icons.webp', 'WEBP', quality=85, method=6)
    (out / 'tech-icons.json').write_text(
        json.dumps({'size': SIZE, 'cols': cols, 'techs': techs}, separators=(',', ':')), encoding='utf-8')
    print(f'tech icons: {len(images)} icons for {len(techs)} techs')


def main():
    from extract import load_dat

    ap = argparse.ArgumentParser()
    ap.add_argument('--game', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    args = ap.parse_args()
    build(load_dat(args.game, Path(__file__).with_name('.dat-cache.pkl')), args.game, args.out)


if __name__ == '__main__':
    main()
