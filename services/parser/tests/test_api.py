import pytest
from fastapi.testclient import TestClient
from test_parse import SAMPLE

from aoe2_parser.api import app

client = TestClient(app)


def test_health():
    assert client.get('/health').json() == {'ok': True, 'schema_version': 1}


def test_parse_sample():
    if not SAMPLE.exists():
        pytest.skip('missing fixture')
    res = client.post('/parse', files={'file': ('r.aoe2record', SAMPLE.read_bytes())})
    assert res.status_code == 200
    assert res.json()['game']['save_version'] == 68.9


def test_parse_garbage():
    res = client.post('/parse', files={'file': ('r.aoe2record', b'\xff' * 64)})
    assert res.status_code == 422
    assert res.json()['error']['code'] == 'corrupt_replay'
