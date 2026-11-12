"""Copies the streamed .wem files of a Wwise package that are at least MIN_BYTES long."""

import sys
from pathlib import Path

from pck import read

if __name__ == '__main__':
    package, out_dir, min_bytes = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(package, 'rb') as f:
        for kind, file_id, offset, size in read(package):
            if kind != 'wem' or size < min_bytes:
                continue
            f.seek(offset)
            (out_dir / f'{file_id}.wem').write_bytes(f.read(size))
            print(file_id, size)
