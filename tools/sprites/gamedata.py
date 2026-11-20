"""Game data the viewer engine uses instead of guesses (game-data.json).

- units: speed, class, cost and where each unit is trained (building, seconds);
- buildings: footprint, build time and cost;
- techs: research time, cost, where, and the units they upgrade ("upgrade unit"
  commands: Knight -> Cavalier). A replay's queue orders always name the base
  unit, so the engine applies these when the research is done;
- names: English names (the game's string table) of the units techs upgrade
  to, which a replay's legend doesn't have since no command names them.

Run on its own to refresh only this file (fast), or from extract.py.
"""

import argparse
import json
import re
from pathlib import Path

UNIT, BUILDING = 70, 80
UPGRADE_UNIT = 3
# The game's resource ids -> index in our costs: [food, wood, gold, stone].
COST_INDEX = {0: 0, 1: 1, 3: 2, 2: 3}


def _cost(costs):
    """[food, wood, gold, stone] the game takes (flag set), or None if free."""
    out = [0, 0, 0, 0]
    for c in costs:
        if c.flag and c.type in COST_INDEX:
            out[COST_INDEX[c.type]] += c.amount
    return out if any(out) else None


def _strings(game: Path):
    path = game / 'resources/en/strings/key-value/key-value-strings-utf8.txt'
    out = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        m = re.match(r'(\d+)\s+"(.*)"', line)
        if m:
            out[int(m.group(1))] = m.group(2)
    return out


def game_data(dat, game: Path):
    units, buildings = {}, {}
    for civ in dat.civs[1:]:
        for unit in civ.units:
            if unit is None or not unit.creatable:
                continue
            trains = [[t.unit_id, t.train_time] for t in unit.creatable.train_locations if t.unit_id >= 0]
            if not trains:
                continue
            # Trebuchets are type 80 too, but trained in a building (the castle),
            # not built by villagers.
            at = civ.units[trains[0][0]] if trains[0][0] < len(civ.units) else None
            trained = unit.type == UNIT or (at is not None and at.type == BUILDING)
            cost = _cost(unit.creatable.resource_costs)
            if trained and unit.id not in units:
                units[unit.id] = {'speed': round(unit.speed, 3), 'class': unit.class_, 'train': trains}
                if cost:
                    units[unit.id]['cost'] = cost
            elif unit.type == BUILDING and not trained and unit.id not in buildings:
                buildings[unit.id] = {'size': round(unit.collision_size_x * 2), 'buildTime': trains[0][1]}
                if cost:
                    buildings[unit.id]['cost'] = cost

    techs = {}
    for tech_id, tech in enumerate(dat.techs):
        places = [[r.location_id, r.research_time] for r in tech.research_locations if r.location_id >= 0]
        if not places:
            continue
        entry = {'at': places}
        cost = _cost(tech.resource_costs)
        if cost:
            entry['cost'] = cost
        if 0 <= tech.effect_id < len(dat.effects):
            ups = [[c.a, c.b] for c in dat.effects[tech.effect_id].effect_commands
                   if c.type == UPGRADE_UNIT and c.a in units and c.b >= 0]
            if ups:
                entry['up'] = ups
        techs[tech_id] = entry

    strings = _strings(game)
    gaia = dat.civs[0].units
    names = {}
    for entry in techs.values():
        for _, to in entry.get('up', []):
            unit = gaia[to] if to < len(gaia) else None
            name = unit and strings.get(unit.language_dll_name)
            if name:
                names[to] = name
    return {'units': units, 'buildings': buildings, 'techs': techs, 'names': names}


def write(dat, game: Path, out: Path):
    data = game_data(dat, game)
    (out / 'game-data.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f"game data: {len(data['units'])} units, {len(data['buildings'])} buildings, "
          f"{len(data['techs'])} techs, {len(data['names'])} names")


def main():
    from extract import load_dat

    ap = argparse.ArgumentParser()
    ap.add_argument('--game', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    args = ap.parse_args()
    write(load_dat(args.game, Path(__file__).with_name('.dat-cache.pkl')), args.game, args.out)


if __name__ == '__main__':
    main()
