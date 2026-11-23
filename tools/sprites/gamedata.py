"""Game data the viewer engine uses instead of guesses (game-data.json).

- units: speed, class, cost, line of sight (los, tiles), population it takes
  (pop, only if not 1) and where each unit is trained (building, seconds);
- buildings: footprint, build time, cost, line of sight and population room
  (pop: house 5);
- techs: research time, cost, where, and the units they upgrade ("upgrade unit"
  commands: Knight -> Cavalier). A replay's queue orders always name the base
  unit, so the engine applies these when the research is done;
- gaia: what each map object carries (trees, mines, bushes, animals): amount
  of its resource (food, wood, gold or stone), as the game has it;
- names: English names (the game's string table) of the units techs upgrade
  to, which a replay's legend doesn't have since no command names them;
- combat, for units and buildings that fight: hit points (hp), attacks and
  armours by class ([[class, amount]]), reload (s), range (tiles) and
  accuracy (%, ranged); and the effects that change them: each tech's (fx:
  [type, unit, class, attribute, amount], types 0 set, 4 add, 5 multiply) and
  each civilization's bonuses (civs). The engine uses them to estimate when
  units die.

Run on its own to refresh only this file (fast), or from extract.py.
"""

import argparse
import json
import re
from pathlib import Path

UNIT, BUILDING = 70, 80
# Effect commands that change combat: 0 set, 4 add, 5 multiply; on hit
# points (0), armour (8), attack (9), reload (10) and range (12).
FX_TYPES = {0, 4, 5}
FX_ATTRIBUTES = {0, 8, 9, 10, 12}
UPGRADE_UNIT = 3
# Resource 4 is population headroom: a building gives it, a unit takes it (negative).
POP = 4
# The game's resource ids -> index in our costs: [food, wood, gold, stone].
COST_INDEX = {0: 0, 1: 1, 3: 2, 2: 3}


def _cost(costs):
    """[food, wood, gold, stone] the game takes (flag set), or None if free."""
    out = [0, 0, 0, 0]
    for c in costs:
        if c.flag and c.type in COST_INDEX:
            out[COST_INDEX[c.type]] += c.amount
    return out if any(out) else None


def _pop(unit):
    """Population headroom of a unit's storages: positive for buildings that give it."""
    return sum(s.amount for s in unit.resource_storages if s.type == POP)


def _strings(game: Path):
    path = game / 'resources/en/strings/key-value/key-value-strings-utf8.txt'
    out = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        m = re.match(r'(\d+)\s+"(.*)"', line)
        if m:
            out[int(m.group(1))] = m.group(2)
    return out


def _combat(unit):
    """Hit points, and attacks, armours, reload, range and accuracy if it fights."""
    out = {'hp': unit.hit_points} if unit.hit_points > 0 else {}
    t50 = getattr(unit, 'type_50', None)
    if not t50:
        return out
    arm = [[a.class_, a.amount] for a in t50.armours]
    if arm:
        out['arm'] = arm
    atk = [[a.class_, a.amount] for a in t50.attacks if a.amount > 0]
    if atk:
        out['atk'] = atk
        out['reload'] = round(t50.reload_time, 3)
        out['range'] = round(t50.max_range, 2)
        if t50.accuracy_percent < 100:
            out['acc'] = t50.accuracy_percent
    return out


def _fx(dat, effect_id):
    """An effect's commands that change combat: [type, unit, class, attribute, amount]."""
    if not 0 <= effect_id < len(dat.effects):
        return []
    return [[c.type, c.a, c.b, c.c, round(c.d, 3)] for c in dat.effects[effect_id].effect_commands
            if c.type in FX_TYPES and c.c in FX_ATTRIBUTES]


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
                units[unit.id] = {'speed': round(unit.speed, 3), 'class': unit.class_, 'los': round(unit.line_of_sight, 1),
                                  'train': trains, **_combat(unit)}
                if cost:
                    units[unit.id]['cost'] = cost
                if _pop(unit) != -1:
                    units[unit.id]['pop'] = -_pop(unit)
            elif unit.type == BUILDING and not trained and unit.id not in buildings:
                buildings[unit.id] = {'size': round(unit.collision_size_x * 2), 'buildTime': trains[0][1],
                                      'los': round(unit.line_of_sight, 1), **_combat(unit)}
                if cost:
                    buildings[unit.id]['cost'] = cost
                if _pop(unit) > 0:
                    buildings[unit.id]['pop'] = _pop(unit)

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
        fx = _fx(dat, tech.effect_id)
        if fx:
            entry['fx'] = fx
        techs[tech_id] = entry

    strings = _strings(game)
    gaia = dat.civs[0].units
    carries = {}
    for unit in gaia:
        if unit is None or unit.type == BUILDING:
            continue
        amount = max((s.amount for s in unit.resource_storages if s.type in COST_INDEX), default=0)
        if amount > 0:
            carries[unit.id] = round(amount)
    names = {}
    for entry in techs.values():
        for _, to in entry.get('up', []):
            unit = gaia[to] if to < len(gaia) else None
            name = unit and strings.get(unit.language_dll_name)
            if name:
                names[to] = name
            # What a unit is upgraded to fights too: its own combat numbers.
            if unit and to not in units:
                combat = _combat(unit)
                if combat:
                    units[to] = {'speed': round(unit.speed, 3), 'class': unit.class_,
                                 'los': round(unit.line_of_sight, 1), 'train': [], **combat}
    # Civilization bonuses: the civ's tech tree effect, and its hidden techs
    # (researched on their own, often with an age: req lists the techs they
    # wait for, ages 101-103 included). By civilization id.
    civs = {}
    for civ_id, civ in enumerate(dat.civs):
        if not civ_id:
            continue
        bonuses = []
        fx = _fx(dat, civ.tech_tree_id)
        if fx:
            bonuses.append({'fx': fx})
        for tech_id, tech in enumerate(dat.techs):
            if tech.civ != civ_id or any(r.location_id >= 0 for r in tech.research_locations):
                continue
            fx = _fx(dat, tech.effect_id)
            if not fx:
                continue
            req = [r for r in tech.required_techs if r >= 0][: max(0, tech.required_tech_count)]
            bonuses.append({'tech': tech_id, 'req': req, 'fx': fx} if req else {'tech': tech_id, 'fx': fx})
        if bonuses:
            civs[civ_id] = bonuses
    return {'units': units, 'buildings': buildings, 'techs': techs, 'gaia': carries, 'names': names, 'civs': civs}


def write(dat, game: Path, out: Path):
    data = game_data(dat, game)
    (out / 'game-data.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f"game data: {len(data['units'])} units, {len(data['buildings'])} buildings, "
          f"{len(data['techs'])} techs, {len(data['gaia'])} gaia objects, {len(data['names'])} names")


def main():
    from extract import load_dat

    ap = argparse.ArgumentParser()
    ap.add_argument('--game', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    args = ap.parse_args()
    write(load_dat(args.game, Path(__file__).with_name('.dat-cache.pkl')), args.game, args.out)


if __name__ == '__main__':
    main()
