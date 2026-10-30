"""Names (from aocref) and render categories (ours) for the IDs used in a replay.

aocref has no published license, so its data is used only as an installed
dependency at parse time and never copied into this repo.
"""

import json
import pkgutil
from functools import cache

# IDs missing from aocref, identified from the sample replay (save 68.9):
# 1984 trees sit on terrain 113 tiles almost one to one.
TERRAIN_OVERRIDES = {113: 'forest'}
OBJECT_OVERRIDES = {1984: 'tree'}

# Ordered: first match wins.
TERRAIN_KEYWORDS = [
    ('shallow', 'shallows'),
    ('deep water', 'deep_water'),
    ('water', 'water'),
    ('forest', 'forest'),
    ('jungle', 'forest'),
    ('bamboo', 'forest'),
    ('palm', 'forest'),
    ('ice', 'snow'),
    ('snow', 'snow'),
    ('road', 'road'),
    ('beach', 'sand'),
    ('desert', 'sand'),
    ('sand', 'sand'),
    ('farm', 'farm'),
    ('rock', 'rock'),
]

OBJECT_KEYWORDS = [
    ('gold mine', 'gold'),
    ('stone mine', 'stone'),
    ('forage', 'berries'),
    ('berry', 'berries'),
    ('fruit', 'berries'),
    ('relic', 'relic'),
    ('tree', 'tree'),
]

# class_id: 10 static, 20 flag/marker, 30 dead/fish, 70 combatant, 80 building.
CLASS_CATEGORY = {70: 'unit', 80: 'building'}


@cache
def _dataset():
    return json.loads(pkgutil.get_data('aocref', 'data/datasets/100.json'))


@cache
def constants():
    return json.loads(pkgutil.get_data('aocref', 'data/constants.json'))


def _lookup(table, key):
    value = _dataset()[table].get(str(key))
    if isinstance(value, dict):
        return value.get('name')
    return value or None


def civilization_name(civ_id):
    return _lookup('civilizations', civ_id)


def map_name(map_id):
    return _lookup('maps', map_id)


def terrain_category(terrain_id, name):
    if terrain_id in TERRAIN_OVERRIDES:
        return TERRAIN_OVERRIDES[terrain_id]
    lowered = (name or '').lower()
    for keyword, category in TERRAIN_KEYWORDS:
        if keyword in lowered:
            return category
    return 'grass'


def object_category(type_id, class_id, player, name):
    if type_id in OBJECT_OVERRIDES:
        return OBJECT_OVERRIDES[type_id]
    lowered = (name or '').lower()
    for keyword, category in OBJECT_KEYWORDS:
        if keyword in lowered:
            return category
    if class_id == 70 and player == 0:
        return 'animal'
    return CLASS_CATEGORY.get(class_id, 'decoration')


def legend(terrain_ids, objects, technology_ids, unit_ids, building_ids):
    """Build the legend for the IDs present in one replay.

    `objects` is an iterable of (type_id, class_id, player).
    """
    terrain = {}
    for tid in sorted(set(terrain_ids)):
        name = _lookup('terrain', tid)
        terrain[str(tid)] = {'name': name, 'category': terrain_category(tid, name)}

    types = {}
    for type_id, class_id, player in objects:
        key = str(type_id)
        if key in types:
            continue
        name = _lookup('objects', type_id)
        types[key] = {'name': name, 'category': object_category(type_id, class_id, player, name)}
    for ids, category in ((unit_ids, 'unit'), (building_ids, 'building')):
        for type_id in ids:
            types.setdefault(str(type_id), {'name': _lookup('objects', type_id), 'category': category})

    return {
        'terrain': terrain,
        'objects': types,
        'technologies': {str(t): _lookup('technologies', t) for t in sorted(set(technology_ids))},
    }
