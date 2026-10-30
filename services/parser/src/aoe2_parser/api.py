"""HTTP service: POST a .aoe2record, get the normalized JSON back. Stateless.

Run: uvicorn aoe2_parser.api:app --port 8000
"""

import asyncio
import os
from concurrent.futures import ProcessPoolExecutor

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from aoe2_parser import SCHEMA_VERSION, ReplayError, parse_replay

MAX_BYTES = int(os.environ.get('PARSER_MAX_BYTES', 30 * 1024 * 1024))
TIMEOUT_S = float(os.environ.get('PARSER_TIMEOUT_S', 30))
WORKERS = int(os.environ.get('PARSER_WORKERS', 2))

app = FastAPI(title='AoE2 Replays parser', version='0.1.0')
# Parsing runs in worker processes so a slow file can't block the event loop.
pool = ProcessPoolExecutor(max_workers=WORKERS)


def _reset_pool():
    """Kills the workers and starts fresh ones. A timed-out parse would otherwise
    keep its worker busy (cancelling a running future does not stop it)."""
    global pool
    old = pool
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

    future = pool.submit(parse_replay, data)
    try:
        return await asyncio.wait_for(asyncio.wrap_future(future), TIMEOUT_S)
    except TimeoutError:
        _reset_pool()
        return _error(504, 'timeout', f'parsing took longer than {TIMEOUT_S:g} s')
    except ReplayError as e:
        return _error(422, e.code, e.message)
    except Exception as e:  # noqa: BLE001 - never leak a traceback to the client
        raise HTTPException(status_code=500, detail='internal parser error') from e
