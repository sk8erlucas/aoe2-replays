"""Parse a .aoe2record into the normalized JSON contract (schema_version 1)."""
import io
import json
import struct

from mgz import fast

from aoe2_parser import reference
from aoe2_parser.vendor import mgz_header

SCHEMA_VERSION = 1

# Lowest save version this parser has been tested against, and the highest.
# Anything above MAX_TESTED_SAVE is attempted but flagged as untested.
MIN_SAVE = 61.5
MAX_TESTED_SAVE = 68.9


class ReplayError(Exception):
    """Base error. `code` is stable and safe to show to users."""

    code = 'invalid_replay'

    def __init__(self, message):
        super().__init__(message)
        self.message = message


class UnsupportedVersion(ReplayError):
    code = 'unsupported_version'


class CorruptReplay(ReplayError):
    code = 'corrupt_replay'


def _text(value):
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    return value


def _parse_header(data):
    try:
        header = mgz_header.parse(io.BytesIO(data))
    except RuntimeError as e:
        raise CorruptReplay(f'could not parse header: {e}') from e
    if header['de'] is None:
        raise UnsupportedVersion(f"only Definitive Edition replays are supported (got {header['version']})")
    if header['save_version'] < MIN_SAVE:
        raise UnsupportedVersion(f"save version {header['save_version']} is older than {MIN_SAVE}")
    return header


def _players(header):
    # The DE section has the reliable civ/color/team; the player section has positions.
    positions = {p['number']: p for p in header['players']}
    players = []
    for p in header['de']['players']:
        if p['number'] < 1:
            continue
        start = positions.get(p['number'], {}).get('position')
        players.append({
            'number': p['number'],
            'name': _text(p['name']),
            'profile_id': p['profile_id'] if p['profile_id'] not in (0, 0xFFFFFFFF) else None,
            'civilization_id': p['civilization_id'],
            'civilization': reference.civilization_name(p['civilization_id']),
            'color_id': p['color_id'],
            'team_id': p['team_id'],
            'is_ai': bool(p['ai_name']),
            'start': {'x': start['x'], 'y': start['y']} if start else None,
        })
    return players


def _map(header):
    m = header['map']
    map_id = header['de'].get('rms_map_id')
    return {
        'id': map_id,
        'name': reference.map_name(map_id),
        'size': m['dimension'],
        # size * size entries; tile (x, y) is at index y * size + x.
        'terrain': [t[0] for t in m['tiles']],
        'elevation': [t[1] for t in m['tiles']],
    }


def _initial_objects(header):
    objects = []
    for p in header['players']:
        for o in p.get('objects', []):
            objects.append({
                'id': o['instance_id'],
                'player': p['number'],
                'type_id': o['object_id'],
                'class_id': o['class_id'],
                'x': o['position']['x'],
                'y': o['position']['y'],
            })
    return objects


def _event(t, action_type, payload):
    event = {'t': t, 'type': action_type.name}
    for key, value in payload.items():
        if key == 'sequence':
            continue
        event['player' if key == 'player_id' else key] = value
    return event


def _parse_body(data, offset):
    body = io.BytesIO(data)
    body.seek(offset)
    fast.meta(body)
    t = 0
    timeline, chat = [], []
    postgame = None
    while True:
        try:
            op_type, payload = fast.operation(body)
        except EOFError:
            break
        except (struct.error, RuntimeError, ValueError) as e:
            raise CorruptReplay(f'could not parse body at byte {body.tell()}: {e}') from e
        if op_type is fast.Operation.SYNC:
            t += payload[0]
        elif op_type is fast.Operation.ACTION:
            action_type, action = payload
            timeline.append(_event(t, action_type, action))
        elif op_type is fast.Operation.CHAT:
            try:
                msg = json.loads(payload)
            except ValueError:
                continue
            chat.append({
                't': t,
                'player': msg.get('player'),
                'channel': msg.get('channel'),
                'message': msg.get('message', ''),
            })
        elif op_type is fast.Operation.POSTGAME:
            postgame = payload
    return t, timeline, chat, postgame


def _legend(map_, objects, timeline):
    techs = [e['technology_id'] for e in timeline if 'technology_id' in e]
    units = [e['unit_id'] for e in timeline if 'unit_id' in e]
    buildings = [e['building_id'] for e in timeline if 'building_id' in e]
    return reference.legend(
        map_['terrain'],
        ((o['type_id'], o['class_id'], o['player']) for o in objects),
        techs,
        units,
        buildings,
    )


def parse_replay(data: bytes) -> dict:
    """Parse raw replay bytes into the normalized contract."""
    if len(data) < 8:
        raise CorruptReplay('file is too small to be a replay')
    header_len, = struct.unpack_from('<I', data)
    if not 8 < header_len <= len(data):
        raise CorruptReplay('header length points outside the file')

    header = _parse_header(data)
    duration, timeline, chat, postgame = _parse_body(data, header_len)
    de = header['de']
    save = header['save_version']
    map_ = _map(header)
    objects = _initial_objects(header)

    return {
        'schema_version': SCHEMA_VERSION,
        'game': {
            'game_version': header['game_version'],
            'save_version': save,
            'build': de.get('build'),
            'untested_version': save > MAX_TESTED_SAVE,
            'duration_ms': duration,
            'speed': round(de['speed'], 2),
            'population_limit': de['population_limit'],
            'victory_type_id': de['victory_type_id'],
            'starting_age_id': de['starting_age_id'],
            'treaty_length': de['treaty_length'],
            'multiplayer': de['multiplayer'],
            'world_time_ms': postgame.get('world_time') if postgame else None,
            'players': _players(header),
        },
        'map': map_,
        'initial_objects': objects,
        'timeline': timeline,
        'chat': chat,
        'legend': _legend(map_, objects, timeline),
    }
