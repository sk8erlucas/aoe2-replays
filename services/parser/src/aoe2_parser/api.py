"""HTTP service: POST a .aoe2record, get the normalized JSON back. Stateless.

Run: uvicorn aoe2_parser.api:app --port 8000
"""

import asyncio
import logging
import os
from concurrent.futures import BrokenExecutor, ProcessPoolExecutor

from fastapi import FastAPI, File, Response, UploadFile
from fastapi.responses import JSONResponse

from aoe2_parser import SCHEMA_VERSION, ReplayError, parse_replay_json

MAX_BYTES = int(os.environ.get('PARSER_MAX_BYTES', 30 * 1024 * 1024))
TIMEOUT_S = float(os.environ.get('PARSER_TIMEOUT_S', 30))
WORKERS = int(os.environ.get('PARSER_WORKERS', 2))

logger = logging.getLogger(__name__)

app = FastAPI(title='AoE2 Replays parser', version='0.1.0')
# Parsing runs in worker processes so a slow file can't block the event loop.
pool = ProcessPoolExecutor(max_workers=WORKERS)


def _reset_pool(old):
    """Kills the workers of `old` and starts fresh ones. A timed-out parse would
    otherwise keep its worker busy (cancelling a running future does not stop it),
    and a pool with a dead worker refuses all work. Does nothing if another
    request already replaced it."""
    global pool
    if pool is not old:
        return
    pool = ProcessPoolExecutor(max_workers=WORKERS)
    for process in list(getattr(old, '_processes', {}).values()):
        process.kill()
    old.shutdown(wait=False, cancel_futures=True)


def _error(status, code, message):
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message}})


@app.get('/health')
def health():
    return {'ok': True, 'schema_version': SCHEMA_VERSION}


@app.post('/parse')
async def parse(file: UploadFile = File(...)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        return _error(413, 'too_large', f'file is larger than {MAX_BYTES // (1024 * 1024)} MB')
    if len(data) < 8:
        return _error(400, 'corrupt_replay', 'file is too small to be a replay')

    current = pool
    try:
        future = current.submit(parse_replay_json, data)
        text = await asyncio.wait_for(asyncio.wrap_future(future), TIMEOUT_S)
    except TimeoutError:
        _reset_pool(current)
        return _error(504, 'timeout', f'parsing took longer than {TIMEOUT_S:g} s')
    except BrokenExecutor:
        # A worker died (out of memory, usually): this request is lost, the next ones are not.
        logger.error('parser worker died, restarting the pool')
        _reset_pool(current)
        return _error(503, 'parser_unavailable', 'the parser had to restart, try again')
    except ReplayError as e:
        return _error(422, e.code, e.message)
    except Exception:  # noqa: BLE001 - never leak a traceback to the client
        logger.exception('unexpected parser error')
        return _error(500, 'parser_error', 'internal parser error')
    return Response(content=text, media_type='application/json')
