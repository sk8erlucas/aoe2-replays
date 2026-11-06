"""Hostile and damaged files: the only acceptable outcomes are a result or a ReplayError."""

import json
import os
import random
import struct
import zlib

import pytest
from fastapi.testclient import TestClient
from mgz import fast
from test_parse import SAMPLE

from aoe2_parser import CorruptReplay, ReplayError, api, parse, parse_replay_json
from aoe2_parser.vendor import mgz_header

client = TestClient(api.app)


def deflate(raw):
    c = zlib.compressobj(1, zlib.DEFLATED, -15)
    return c.compress(raw) + c.flush()


def with_header(raw, body=b''):
    comp = deflate(raw)
    return struct.pack('<II', len(comp) + 8, 0) + comp + body


def body_with(monkeypatch, operations):
    """Runs _parse_body over a scripted list of operations."""
    ops = iter(operations)

    def operation(_):
        try:
            return next(ops)
        except StopIteration:
            raise EOFError from None

    monkeypatch.setattr(fast, 'meta', lambda _: None)
    monkeypatch.setattr(fast, 'operation', operation)
    return parse._parse_body(b'', 0)


def test_header_bomb_is_refused_before_it_expands(monkeypatch):
    monkeypatch.setattr(mgz_header, 'MAX_HEADER_BYTES', 1024 * 1024)
    with pytest.raises(CorruptReplay, match='truncated or too large'):
        parse.parse_replay(with_header(b'\0' * (2 * 1024 * 1024)))


def test_truncated_header_stream():
    data = with_header(os.urandom(4096))
    (length,) = struct.unpack_from('<I', data)
    cut = data[: length // 2]
    with pytest.raises(CorruptReplay):
        parse.parse_replay(struct.pack('<I', len(cut)) + cut[4:])


def test_body_that_ends_before_its_meta_block(monkeypatch):
    monkeypatch.setattr(parse, '_parse_header', lambda _: {})
    data = struct.pack('<II', 9, 0) + b'\0'
    with pytest.raises(CorruptReplay, match='body start'):
        parse.parse_replay(data)


@pytest.mark.parametrize(
    'payload',
    [
        b'[1, 2]',
        b'5',
        b'null',
        b'"text"',
        b'\xff\xfe{',
        b'{"message": {"a": 1}}',
        b'{"message": 7}',
        pytest.param(b'[' * 200_000, id='deeply-nested'),
    ],
)
def test_chat_that_breaks_the_contract_is_skipped(monkeypatch, payload):
    assert body_with(monkeypatch, [(fast.Operation.CHAT, payload)])[2] == []


def test_chat_with_odd_fields_keeps_the_message(monkeypatch):
    payload = json.dumps({'player': 'x', 'channel': [1], 'message': 'gg'}).encode()
    chat = body_with(monkeypatch, [(fast.Operation.CHAT, payload)])[2]
    assert chat == [{'t': 0, 'player': None, 'channel': None, 'message': 'gg'}]


@pytest.mark.parametrize('duration', [-1, parse.MAX_DURATION_MS + 1, 2**40])
def test_match_clock_out_of_range(monkeypatch, duration):
    monkeypatch.setattr(parse, '_parse_header', lambda _: {})
    monkeypatch.setattr(parse, '_parse_body', lambda *_: (duration, [], [], None))
    with pytest.raises(CorruptReplay, match='clock'):
        parse.parse_replay(struct.pack('<II', 9, 0) + b'\0')


@pytest.mark.parametrize('number', [float('nan'), float('inf'), float('-inf')])
def test_numbers_json_cannot_hold(monkeypatch, number):
    monkeypatch.setattr(parse, 'parse_replay', lambda _: {'x': number})
    with pytest.raises(CorruptReplay, match='invalid number'):
        parse_replay_json(b'')


def test_text_drops_nul():
    assert parse._text(b'a\x00b') == 'ab'
    assert parse._text('a\x00b') == 'ab'
    assert parse._text(None) is None


def test_service_survives_a_dead_worker():
    """A pool with a dead worker refuses all work until it is replaced."""
    api.pool.submit(os._exit, 1).exception()
    res = client.post('/parse', files={'file': ('r.aoe2record', b'\xff' * 64)})
    assert res.status_code == 503
    assert res.json()['error']['code'] == 'parser_unavailable'
    res = client.post('/parse', files={'file': ('r.aoe2record', b'\xff' * 64)})
    assert res.status_code == 422


def test_unexpected_errors_stay_generic(monkeypatch):
    class Pool:
        def submit(self, *_):
            raise KeyError('C:/secret/path.py')

    monkeypatch.setattr(api, 'pool', Pool())
    res = client.post('/parse', files={'file': ('r.aoe2record', b'\xff' * 64)})
    assert res.status_code == 500
    assert res.json() == {'error': {'code': 'parser_error', 'message': 'internal parser error'}}


def mutate(data, rnd):
    (length,) = struct.unpack_from('<I', data)
    kind = rnd.choice(['header', 'header', 'body', 'cut', 'lengths'])
    if kind == 'header':
        raw = bytearray(zlib.decompress(data[8:length], wbits=-15))
        for _ in range(rnd.choice([1, 8, 64])):
            raw[rnd.randrange(len(raw))] = rnd.choice([0, 0x7F, 0x80, 0xFF, rnd.randrange(256)])
        return with_header(bytes(raw), data[length:])
    out = bytearray(data)
    if kind == 'body':
        for _ in range(rnd.choice([1, 64, 512])):
            out[rnd.randrange(length, len(out))] = rnd.randrange(256)
    elif kind == 'cut':
        out = out[: rnd.randrange(8, len(out))]
    else:
        struct.pack_into('<I', out, rnd.choice([0, 4]), rnd.choice([0, 9, length - 1, length + 1, 0xFFFFFFFF]))
    return bytes(out)


@pytest.mark.skipif(not SAMPLE.exists(), reason='missing fixture')
def test_fuzz():
    data = SAMPLE.read_bytes()
    seed = int(os.environ.get('FUZZ_SEED', 1))
    rnd = random.Random(seed)
    for i in range(int(os.environ.get('FUZZ_RUNS', 40))):
        mutant = mutate(data, rnd)
        try:
            json.loads(parse_replay_json(mutant))
        except ReplayError:
            pass
        except Exception as e:
            pytest.fail(f'seed {seed}, run {i}: {type(e).__name__}: {e}')
