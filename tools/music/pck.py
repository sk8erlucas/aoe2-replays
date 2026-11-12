"""Lists the files inside a Wwise AKPK package (.pck): sound banks and streamed .wem files."""

import struct
import sys
from pathlib import Path


def read(path):
    """[(kind, file_id, offset, size)] for every bank ('bnk') and stream ('wem')."""
    with open(path, 'rb') as f:
        magic, header_size, _version, lang_size, bank_size, stream_size = struct.unpack('<4sIIIII', f.read(24))
        if magic != b'AKPK':
            raise ValueError(f'{path}: not a Wwise package')
        # Newer packages add a fourth table size (external files) after the first three.
        extra = header_size - 16 - lang_size - bank_size - stream_size
        f.seek(24 + (4 if extra >= 4 else 0) + lang_size)
        files = []
        for kind, size in (('bnk', bank_size), ('wem', stream_size)):
            start = f.tell()
            count = struct.unpack('<I', f.read(4))[0] if size else 0
            if count:
                entry = (size - 4) // count
                id_size = entry - 16  # 4-byte ids, or 8 bytes in newer stream tables
                for _ in range(count):
                    raw = f.read(entry)
                    file_id = int.from_bytes(raw[:id_size], 'little')
                    block, file_size, offset, _lang = struct.unpack('<IIII', raw[id_size:])
                    files.append((kind, file_id, offset * (block or 1), file_size))
            f.seek(start + size)
    return files


if __name__ == '__main__':
    entries = sorted(read(sys.argv[1]), key=lambda e: -e[3])
    print(len(entries), 'files in', Path(sys.argv[1]).name)
    for kind, file_id, offset, size in entries[: int(sys.argv[2]) if len(sys.argv) > 2 else 15]:
        print(kind, file_id, offset, size)
