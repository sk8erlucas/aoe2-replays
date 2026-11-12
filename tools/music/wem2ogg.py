"""Wwise Opus (.wem, codec 0x3041) to Ogg Opus, without re-encoding.

The Opus packets are stored back to back in the 'data' chunk; their sizes are the
u16 entries of the 'seek' chunk. 'fmt ' holds the sample count, packet count and
pre-skip. Every packet is a 20 ms frame (960 samples at 48 kHz).
"""

import struct
import sys

def crc_table():
    t = []
    for i in range(256):
        r = i << 24
        for _ in range(8):
            r = ((r << 1) ^ 0x04C11DB7) if r & 0x80000000 else (r << 1)
        t.append(r & 0xFFFFFFFF)
    return t
T = crc_table()
def ogg_crc(b):
    c = 0
    for x in b:
        c = ((c << 8) ^ T[((c >> 24) & 0xFF) ^ x]) & 0xFFFFFFFF
    return c

def page(packets, granule, serial, seq, flags):
    segs = []
    for p in packets:
        n = len(p)
        segs += [255] * (n // 255) + [n % 255]
    assert len(segs) <= 255
    hdr = struct.pack('<4sBBqIIIB', b'OggS', 0, flags, granule, serial, seq, 0, len(segs)) + bytes(segs)
    body = b''.join(packets)
    crc = ogg_crc(hdr + body)
    hdr = hdr[:22] + struct.pack('<I', crc) + hdr[26:]
    return hdr + body

def convert(src, dst):
    d = open(src, 'rb').read()
    chunks, p = {}, 12
    while p < len(d):
        cid = d[p:p+4]; sz = struct.unpack('<I', d[p+4:p+8])[0]
        chunks[cid] = d[p+8:p+8+sz]; p += 8 + sz + (sz & 1)
    fmt, seek, data = chunks[b'fmt '], chunks[b'seek'], chunks[b'data']
    codec, channels, rate = struct.unpack('<HHI', fmt[:8])
    assert codec == 0x3041 and channels <= 2, (codec, channels)
    num_samples, count, preskip = struct.unpack('<IIH', fmt[0x18:0x22])
    sizes = struct.unpack(f'<{count}H', seek[:count*2])
    assert sum(sizes) == len(data), (sum(sizes), len(data))
    serial, seq, out = 0x41453221, 0, bytearray()
    head = b'OpusHead' + struct.pack('<BBHIhB', 1, channels, preskip, rate, 0, 0)
    out += page([head], 0, serial, seq, 2); seq += 1
    out += page([b'OpusTags' + struct.pack('<I', 9) + b'aoe2-rec' + b'\0' + struct.pack('<I', 0)], 0, serial, seq, 0); seq += 1
    off, granule, batch, segs = 0, 0, [], 0
    total = preskip + num_samples
    for i, n in enumerate(sizes):
        pkt = data[off:off+n]; off += n
        batch.append(pkt); segs += n // 255 + 1
        granule += 960  # 20 ms frames (checked against num_samples below)
        last = i == count - 1
        if segs > 200 or last:
            out += page(batch, min(granule, total) if last else granule, serial, seq, 4 if last else 0)
            seq += 1; batch, segs = [], 0
    open(dst, 'wb').write(out)
    return num_samples / rate, count * 960 - preskip - num_samples

if __name__ == '__main__':
    secs, slack = convert(sys.argv[1], sys.argv[2])
    print(f'{secs:.1f}s slack={slack}')
