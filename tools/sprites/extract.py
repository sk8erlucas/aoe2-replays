"""Extracts game sprites into WebP atlases + manifest.json for the viewer.

Usage:
  .venv/Scripts/python extract.py --game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE" \
      --out ../../apps/web/public/sprites

What goes in comes from the game's own data file (empires2_x2_p1.dat):
buildings per civilization and age (following the age-up "upgrade unit"
effects), town center parts (annexes) with their offsets, unit idle/walk
graphics, and gaia objects. Art is Microsoft's, used under the Game Content
Usage Rules (see docs/LEGAL.md).
"""
import argparse
import json
import os
import pickle
from pathlib import Path

import numpy as np
from PIL import Image

import sld

TILE_PX = 86  # width of one tile in the x1 graphics (measured on foundations)
AGE_TECHS = {2: 101, 3: 102, 4: 103}  # Feudal, Castle, Imperial
MAX_ATLAS = 4096
PAD = 1

# Buildings drawn by the viewer (dat unit ids, Dark Age versions).
BUILDINGS = [70, 109, 68, 562, 584, 12, 87, 101, 103, 84, 104, 209, 82, 45, 49, 79, 50, 72, 117]
# Units with idle/walk graphics. Villagers (male, female) and the scout first.
UNITS = [
    83, 293,  # villagers
    74, 75, 77, 473, 567,  # militia line
    93, 358, 359,  # spearman line
    4, 24, 492, 7, 6, 5,  # archers, skirmishers, hand cannoneer
    39, 474, 40,  # cavalry archers
    448, 546, 441, 38, 283, 569, 329, 330, 207,  # scouts, knights, camels
    751, 753, 752,  # eagles
    1258, 422, 548, 280, 550, 588, 279, 542, 36, 42, 331,  # siege
    125, 128,  # monk, trade cart
    13, 545, 17, 539, 21, 442, 529, 1103, 1104,  # ships
]
WALK_FRAMES = 6  # frames kept per direction of a walk cycle
ANGLES_KEPT = 16
TREE_VARIANTS = 4


def load_dat(game: Path, cache: Path):
    dat_path = game / 'resources/_common/dat/empires2_x2_p1.dat'
    stamp = dat_path.stat().st_mtime
    if cache.exists():
        stored_stamp, dat = pickle.loads(cache.read_bytes())
        if stored_stamp == stamp:
            return dat
    from genieutils.datfile import DatFile

    dat = DatFile.parse(str(dat_path))
    cache.write_bytes(pickle.dumps((stamp, dat)))
    return dat


def graphic(dat, gid):
    if gid is None or gid < 0 or gid >= len(dat.graphics):
        return None
    return dat.graphics[gid]


def age_upgrades(dat):
    """age -> {unit id: upgraded unit id} from the age techs' 'upgrade unit' commands."""
    out = {}
    for age, tech_id in AGE_TECHS.items():
        effect = dat.effects[dat.techs[tech_id].effect_id]
        out[age] = {c.a: c.b for c in effect.effect_commands if c.type == 3}
    return out


class Collector:
    """Collects frame requests, then decodes each file once and keeps only small trimmed images."""

    def __init__(self, graphics_dir: Path, scale: float):
        self.dir = graphics_dir
        self.scale = scale
        self.requests: dict[str, set[int]] = {}
        self.counts: dict[str, int] = {}
        self.frames = {}  # key -> (base RGBA image, mask image or None, anchor x, anchor y)

    def add(self, stem, index):
        """Registers a frame and returns its key, or None if the file or frame does not exist."""
        if stem not in self.counts:
            path = self.dir / f'{stem}.sld'
            self.counts[stem] = sld.frame_count(path.read_bytes()[:16]) if path.exists() else 0
        if index >= self.counts[stem]:
            return None
        self.requests.setdefault(stem, set()).add(index)
        return f'{stem}#{index}'

    def materialize(self):
        for n, (stem, wanted) in enumerate(sorted(self.requests.items())):
            frames = sld.parse((self.dir / f'{stem}.sld').read_bytes(), wanted)
            for index, f in frames.items():
                entry = self._trim(f)
                if entry:
                    self.frames[f'{stem}#{index}'] = entry
            if n % 100 == 0:
                print(f'  {n}/{len(self.requests)} files', flush=True)

    def _trim(self, f):
        if f.main is None:
            return None
        base = np.zeros((f.height, f.width, 4), dtype=np.uint8)
        if f.shadow is not None:
            base[..., 3] = (f.shadow.astype(np.float32) * 0.45).astype(np.uint8)
        m = f.main
        solid = m[..., 3] > 0
        base[solid] = m[solid]
        mask = None
        if f.player is not None and (f.player > 0).any():
            mask = np.zeros_like(base)
            on = (f.player > 0) & solid
            mask[..., 0] = mask[..., 1] = mask[..., 2] = f.player
            mask[..., 3] = np.where(on, 255, 0)
        ys, xs = np.nonzero(base[..., 3])
        if len(xs) == 0:
            return None
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        w = max(1, round((x1 - x0) * self.scale))
        h = max(1, round((y1 - y0) * self.scale))
        img = Image.fromarray(base[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS)
        mimg = Image.fromarray(mask[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS) if mask is not None else None
        return img, mimg, (f.hotspot_x - x0) * self.scale, (f.hotspot_y - y0) * self.scale


def pack(frames, keys, out_dir: Path, group: str):
    """Shelf-packs frames into atlas pages; returns {key: entry}."""
    items = sorted(keys, key=lambda k: -frames[k][0].height)
    pages, entries = [], {}
    x = y = shelf = 0
    page = None
    for k in items:
        img = frames[k][0]
        w, h = img.width + PAD, img.height + PAD
        if page is None or x + w > MAX_ATLAS:
            x, y, shelf = 0, y + shelf, 0
        if page is None or y + h > MAX_ATLAS:
            page = {'items': [], 'w': 0, 'h': 0}
            pages.append(page)
            x = y = shelf = 0
        page['items'].append((k, x, y))
        page['w'] = max(page['w'], x + w)
        page['h'] = max(page['h'], y + h)
        shelf = max(shelf, h)
        x += w
    for pi, page in enumerate(pages):
        name = f'{group}-{pi}'
        base = Image.new('RGBA', (page['w'], page['h']))
        mask = Image.new('RGBA', (page['w'], page['h']))
        has_mask = False
        for k, px, py in page['items']:
            img, mimg, ax, ay = frames[k]
            base.paste(img, (px, py))
            if mimg is not None:
                mask.paste(mimg, (px, py))
                has_mask = True
            entries[k] = {'p': name, 'x': px, 'y': py, 'w': img.width, 'h': img.height,
                          'ax': round(ax, 1), 'ay': round(ay, 1), 'm': 1 if mimg is not None else 0}
        base.save(out_dir / f'{name}.webp', 'WEBP', quality=82, method=6)
        if has_mask:
            mask.save(out_dir / f'{name}-mask.webp', 'WEBP', quality=85, method=6)
    return entries


def group_of(stem):
    """Atlas page group: one per building set, one per unit/animal/tree graphic.

    Small groups let the viewer download only what a match uses."""
    parts = stem.split('_')
    if parts[0] == 'b':
        return f'b-{parts[1]}'
    if parts[0] in ('u', 'a') or stem.startswith('n_tree'):
        return stem.removesuffix('_x1')
    return 'gaia'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--scale', type=float, default=0.75, help='64 px tiles at 0.75')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    dat = load_dat(args.game, Path(__file__).with_name('.dat-cache.pkl'))
    col = Collector(args.game / 'resources/_common/drs/graphics', args.scale)
    upgrades = age_upgrades(dat)

    def resolve(unit_id, age):
        """Unit id after the age-up upgrades up to `age`. Later ages may upgrade
        either the previous id or the original one."""
        uid = unit_id
        for a in range(2, age + 1):
            uid = upgrades[a].get(uid) or upgrades[a].get(unit_id) or uid
        return uid

    def layers_of(gid):
        """[(stem, pixel dx, pixel dy)] for a graphic. Some graphics are only a container
        of sub-graphics (deltas): walls and gates are a flag plus the actual wall."""
        g = graphic(dat, gid)
        if not g:
            return []
        subs = [(graphic(dat, d.graphic_id), d.offset_x, d.offset_y) for d in g.deltas if d.graphic_id >= 0]
        subs = [(sg.file_name, ox, oy) for sg, ox, oy in subs if sg and sg.file_name and 'flag' not in sg.file_name]
        if subs:
            return subs
        return [(g.file_name, 0, 0)] if g.file_name else []

    def stem_of(gid):
        g = graphic(dat, gid)
        return g.file_name if g and g.file_name else None

    civs = {}
    for civ_id, civ in enumerate(dat.civs):
        if civ_id == 0:
            continue
        buildings = {}
        for bid in BUILDINGS:
            ages = {}
            base = civ.units[bid] if bid < len(civ.units) else None
            annexes = [(a.unit_id, a.misplacement_x, a.misplacement_y)
                       for a in (base.building.annexes if base and base.building else []) if a.unit_id >= 0]
            for age in (1, 2, 3, 4):
                uid = resolve(bid, age)
                unit = civ.units[uid] if uid < len(civ.units) else None
                if unit is None:
                    continue
                # Annexes (town center parts) are upgraded by the same age effects.
                parts = [(uid, 0.0, 0.0)] + [(resolve(aid, age), dx, dy) for aid, dx, dy in annexes]
                frames = []
                for pid, dx, dy in parts:
                    part = civ.units[pid] if pid < len(civ.units) else None
                    if part is None:
                        continue
                    for stem, ox, oy in layers_of(part.standing_graphic[0]):
                        key = col.add(stem, 0)
                        if key:
                            # Tile offset of the part, then pixel offset of the sub-graphic (exported scale).
                            frames.append([key, dx, dy, round(ox * args.scale, 1), round(oy * args.scale, 1)])
                if frames:
                    ages[age] = frames
            if ages:
                buildings[bid] = ages
        units = {}
        for uid in UNITS:
            unit = civ.units[uid] if uid < len(civ.units) else None
            if unit is None:
                continue
            entry = {}
            idle = graphic(dat, unit.standing_graphic[0])
            if idle and idle.file_name:
                fc, ac = max(1, idle.frame_count), max(1, idle.angle_count)
                keys = [col.add(idle.file_name, a * fc) for a in range(ac)]
                if all(keys):
                    entry['idle'] = keys
            walk = graphic(dat, unit.dead_fish.walking_graphic) if unit.dead_fish else None
            if walk and walk.file_name:
                fc, ac = max(1, walk.frame_count), max(1, walk.angle_count)
                step = max(1, fc // WALK_FRAMES)
                keys = [[col.add(walk.file_name, a * fc + f) for f in range(0, fc, step)] for a in range(ac)]
                if all(all(k) for k in keys):
                    entry['walk'] = keys
            if entry:
                units[uid] = entry
        civs[civ_id] = {'name': civ.name, 'buildings': buildings, 'units': units}

    # Gaia: trees, mines, bushes, relics and animals, by unit id.
    gaia = {}
    for uid, unit in enumerate(dat.civs[0].units):
        if unit is None:
            continue
        g = graphic(dat, unit.standing_graphic[0])
        if not g or not g.file_name:
            continue
        stem = g.file_name
        if not stem.startswith(('n_tree', 'n_mine', 'n_forage', 'a_', 'u_misc_relic')):
            continue
        fc, ac = max(1, g.frame_count), max(1, g.angle_count)
        if stem.startswith('n_tree'):
            keys = [col.add(stem, i) for i in range(min(TREE_VARIANTS, fc * ac))]
        elif stem.startswith('a_'):
            keys = [col.add(stem, a * fc) for a in range(ac)]
        else:
            keys = [col.add(stem, 0)]
        keys = [k for k in keys if k]
        if keys:
            gaia[uid] = keys

    print(f'decoding {len(col.requests)} files', flush=True)
    col.materialize()
    ok = col.frames.keys()
    for civ in civs.values():
        for bid, ages in list(civ['buildings'].items()):
            for age, parts in list(ages.items()):
                parts[:] = [p for p in parts if p[0] in ok]
                if not parts:
                    del ages[age]
            if not ages:
                del civ['buildings'][bid]
        for uid, entry in list(civ['units'].items()):
            if 'idle' in entry and not all(k in ok for k in entry['idle']):
                del entry['idle']
            if 'walk' in entry and not all(k in ok for frames in entry['walk'] for k in frames):
                del entry['walk']
            if not entry:
                del civ['units'][uid]
    for uid in list(gaia):
        gaia[uid] = [k for k in gaia[uid] if k in ok]
        if not gaia[uid]:
            del gaia[uid]

    groups = {}
    for key in col.frames:
        groups.setdefault(group_of(key.split('#')[0]), []).append(key)
    entries = {}
    for group, keys in sorted(groups.items()):
        entries.update(pack(col.frames, keys, args.out, group))
        print(f'{group}: {len(keys)} frames')

    # Game data the engine uses instead of guesses: where each unit is trained,
    # how long it takes, how fast it walks; building footprints and build times.
    game_units, game_buildings = {}, {}
    for civ in dat.civs[1:]:
        for unit in civ.units:
            if unit is None or not unit.creatable:
                continue
            trains = [[t.unit_id, t.train_time] for t in unit.creatable.train_locations if t.unit_id >= 0]
            if not trains:
                continue
            if unit.type in (80,) and unit.id not in game_buildings:  # buildings
                game_buildings[unit.id] = {'size': round(unit.collision_size_x * 2), 'buildTime': trains[0][1]}
            elif unit.type == 70 and unit.id not in game_units:  # combatants
                game_units[unit.id] = {'speed': round(unit.speed, 3), 'class': unit.class_, 'train': trains}
    (args.out / 'game-data.json').write_text(
        json.dumps({'units': game_units, 'buildings': game_buildings}, separators=(',', ':')), encoding='utf-8')
    print(f'game data: {len(game_units)} units, {len(game_buildings)} buildings')

    # Compact manifest: frames as arrays, referenced by index everywhere else.
    pages = sorted({e['p'] for e in entries.values()})
    page_index = {name: i for i, name in enumerate(pages)}
    keys = sorted(entries)
    index = {k: i for i, k in enumerate(keys)}
    frames = [[page_index[entries[k]['p']], entries[k]['x'], entries[k]['y'], entries[k]['w'], entries[k]['h'],
               entries[k]['ax'], entries[k]['ay'], entries[k]['m']] for k in keys]

    def ref(value):
        if isinstance(value, str):
            return index[value]
        if isinstance(value, list):
            return [ref(v) for v in value]
        if isinstance(value, dict):
            return {k: ref(v) for k, v in value.items()}
        return value

    manifest = {
        'version': 2,
        'scale': args.scale,
        'tilePx': TILE_PX * args.scale,
        'pages': pages,
        # [page, x, y, w, h, anchor x, anchor y, has player mask]
        'frames': frames,
        'civs': {cid: {'name': c['name'], 'buildings': ref(c['buildings']), 'units': ref(c['units'])}
                 for cid, c in civs.items()},
        'gaia': ref(gaia),
    }
    (args.out / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    total = sum(f.stat().st_size for f in args.out.iterdir())
    print(f'{len(entries)} frames, {total / 1024 / 1024:.1f} MB in {args.out}')


if __name__ == '__main__':
    main()
