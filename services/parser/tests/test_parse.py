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
