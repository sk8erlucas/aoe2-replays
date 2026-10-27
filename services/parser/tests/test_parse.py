from pathlib import Path

import pytest

from aoe2_parser import CorruptReplay, parse_replay

FIXTURES = Path(__file__).resolve().parents[3] / 'fixtures'
SAMPLE = FIXTURES / 'AgeIIDE_Replay_516585531.aoe2record'


@pytest.fixture(scope='module')
def sample():
    if not SAMPLE.exists():
        pytest.skip(f'missing fixture {SAMPLE.name}')
    return parse_replay(SAMPLE.read_bytes())


def test_game(sample):
    game = sample['game']
    assert sample['schema_version'] == 1
    assert game['game_version'] == 'VER 9.4'
    assert game['save_version'] == 68.9
    assert game['duration_ms'] == 51091
    assert len(game['players']) == 8


def test_players_come_from_de_section(sample):
    first = sample['game']['players'][0]
    assert first['name'] == 'Bc. .'
    assert first['civilization_id'] == 28
    assert first['team_id'] == 2
    assert first['start'] == {'x': 121.0, 'y': 22.0}


def test_map(sample):
    m = sample['map']
    assert m['size'] == 220
    assert len(m['terrain']) == len(m['elevation']) == 220 * 220


def test_actions_reference_initial_objects(sample):
    ids = {o['id'] for o in sample['initial_objects']}
    research = next(e for e in sample['timeline'] if e['type'] == 'RESEARCH')
    assert research['object_ids'][0] in ids


def test_timeline_and_chat(sample):
    types = [e['type'] for e in sample['timeline']]
    assert len(types) == 200
    assert types.count('MOVE') == 91
    assert [c['message'] for c in sample['chat']] == ['report purple thx', 'gg']


@pytest.mark.parametrize('data', [b'', b'\x00' * 4, b'\xff\xff\xff\x7f' + b'\x00' * 20])
def test_rejects_garbage(data):
    with pytest.raises(CorruptReplay):
        parse_replay(data)


def test_rejects_truncated():
    if not SAMPLE.exists():
        pytest.skip('missing fixture')
    with pytest.raises(CorruptReplay):
        parse_replay(SAMPLE.read_bytes()[:50_000])


def test_names_and_legend(sample):
    assert sample['game']['players'][0]['civilization'] == 'Khmer'
    assert sample['map']['name'] == 'Black Forest'
    legend = sample['legend']
    assert legend['terrain']['113']['category'] == 'forest'
    assert legend['terrain']['1']['category'] == 'shallows'
    assert legend['objects']['1984']['category'] == 'tree'
    assert legend['objects']['66']['category'] == 'gold'
    assert legend['objects']['109']['category'] == 'building'
    assert legend['objects']['48']['category'] == 'animal'
    assert legend['objects']['70'] == {'name': 'House', 'category': 'building'}
    assert legend['technologies']['22'] == 'Loom'


def test_event_converts_raw_bytes():
    from mgz.fast import Action

    from aoe2_parser.parse import _event

    event = _event(1000, Action.DE_TRIBUTE, {'player_id': 2, 'target_player_id': b'\x01', 'gold': 100.0})
    assert event == {'t': 1000, 'type': 'DE_TRIBUTE', 'player': 2, 'target_player_id': 1, 'gold': 100.0}


LONG = FIXTURES / 'AgeIIDE_Replay_516586396.aoe2record'


def test_full_length_match_is_json_serializable():
    import json

    if not LONG.exists():
        pytest.skip(f'missing fixture {LONG.name}')
    result = parse_replay(LONG.read_bytes())
    assert result['game']['duration_ms'] > 45 * 60_000
    assert any(e['type'] == 'DE_TRIBUTE' for e in result['timeline'])
    json.dumps(result)
