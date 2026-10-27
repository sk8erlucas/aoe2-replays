"""Decoder for Age of Empires II: DE .sld sprite files.

Format reference: openage, doc/media/sld-files.md. Pixels are stored as 4x4
blocks: the main layer in BC1 (DXT1), shadow and player-color layers in BC4.
A command list says how many blocks to skip (transparent, or kept from the
previous frame) and how many to draw.
"""
import struct
from dataclasses import dataclass, field

import numpy as np

# The reference numbers bits from the most significant one, so its "bit 7" is 0x01.
LAYER_MAIN, LAYER_SHADOW, LAYER_UNKNOWN, LAYER_DAMAGE, LAYER_PLAYER = 0x01, 0x02, 0x04, 0x08, 0x10
FLAG_REUSE = 0x80


@dataclass
class Frame:
    width: int
    height: int
    hotspot_x: int
    hotspot_y: int
    # Canvas-sized arrays; None when the layer is absent.
    main: np.ndarray | None = None  # (h, w, 4) uint8 RGBA
    shadow: np.ndarray | None = None  # (h, w) uint8 alpha
    player: np.ndarray | None = None  # (h, w) uint8 intensity
    extra: dict = field(default_factory=dict)


def _rgb565(c):
    r = ((c >> 11) & 0x1F) * 255 // 31
    g = ((c >> 5) & 0x3F) * 255 // 63
    b = (c & 0x1F) * 255 // 31
    return np.stack([r, g, b], axis=-1)


def decode_bc1(blocks: bytes) -> np.ndarray:
    """BC1 blocks -> (n, 4, 4, 4) RGBA."""
    n = len(blocks) // 8
    raw = np.frombuffer(blocks, dtype='<u2', count=n * 4).reshape(n, 4)
    c0, c1 = raw[:, 0].astype(np.int32), raw[:, 1].astype(np.int32)
    idx = (raw[:, 2].astype(np.uint32) | (raw[:, 3].astype(np.uint32) << 16))
    p0, p1 = _rgb565(c0), _rgb565(c1)
    four = (c0 > c1)[:, None]
    p2 = np.where(four, (2 * p0 + p1) // 3, (p0 + p1) // 2)
    p3 = np.where(four, (p0 + 2 * p1) // 3, 0)
    palette = np.stack([p0, p1, p2, p3], axis=1)  # (n, 4, 3)
    alpha = np.full((n, 4), 255, dtype=np.int32)
    alpha[:, 3] = np.where(four[:, 0], 255, 0)
    shifts = np.arange(16, dtype=np.uint32) * 2
    sel = ((idx[:, None] >> shifts) & 3).astype(np.int64)  # (n, 16)
    rgb = np.take_along_axis(palette, sel[:, :, None].repeat(3, axis=2), axis=1)
    a = np.take_along_axis(alpha, sel, axis=1)
    out = np.concatenate([rgb, a[:, :, None]], axis=2).astype(np.uint8)
    return out.reshape(n, 4, 4, 4)


def decode_bc4(blocks: bytes) -> np.ndarray:
    """BC4 blocks -> (n, 4, 4) uint8."""
    n = len(blocks) // 8
    raw = np.frombuffer(blocks, dtype=np.uint8, count=n * 8).reshape(n, 8).astype(np.int32)
    c0, c1 = raw[:, 0], raw[:, 1]
    bits = np.zeros(n, dtype=np.uint64)
    for i in range(6):
        bits |= raw[:, 2 + i].astype(np.uint64) << np.uint64(8 * i)
    eight = (c0 > c1)[:, None]
    pal8 = np.empty((n, 8), dtype=np.int32)
    pal6 = np.empty((n, 8), dtype=np.int32)
    pal8[:, 0], pal8[:, 1] = c0, c1
    pal6[:, 0], pal6[:, 1] = c0, c1
    for i in range(2, 8):
        pal8[:, i] = ((8 - i) * c0 + (i - 1) * c1) // 7
    for i in range(2, 6):
        pal6[:, i] = ((6 - i) * c0 + (i - 1) * c1) // 5
    pal6[:, 6], pal6[:, 7] = 0, 255
    palette = np.where(eight, pal8, pal6)
    shifts = (np.arange(16, dtype=np.uint64) * np.uint64(3))
    sel = ((bits[:, None] >> shifts) & np.uint64(7)).astype(np.int64)
    return np.take_along_axis(palette, sel, axis=1).astype(np.uint8).reshape(n, 4, 4)


def _place(commands, blocks, width_blocks, height_blocks, prev, fill):
    """Lays decoded blocks on a block grid following the skip/draw commands."""
    shape = blocks.shape[1:]
    grid = np.zeros((height_blocks, width_blocks) + shape, dtype=np.uint8)
    if fill is not None:
        grid[...] = fill
    pos = 0
    b = 0
    total = width_blocks * height_blocks
    for skip, draw in commands:
        if prev is not None:
            for p in range(pos, min(pos + skip, total)):
                grid[p // width_blocks, p % width_blocks] = prev[p // width_blocks, p % width_blocks]
        pos += skip
        for _ in range(draw):
            if pos >= total:
                break
            grid[pos // width_blocks, pos % width_blocks] = blocks[b]
            b += 1
            pos += 1
    return grid


def _grid_to_image(grid):
    h, w = grid.shape[:2]
    if grid.ndim == 5:  # RGBA blocks
        return grid.transpose(0, 2, 1, 3, 4).reshape(h * 4, w * 4, grid.shape[-1])
    return grid.transpose(0, 2, 1, 3).reshape(h * 4, w * 4)


def _read_commands(data, off):
    count, = struct.unpack_from('<H', data, off)
    off += 2
    cmds = [struct.unpack_from('<BB', data, off + 2 * i) for i in range(count)]
    return cmds, off + 2 * count


def frame_count(data: bytes) -> int:
    sig, _, nframes = struct.unpack_from('<4s2H', data, 0)
    return nframes if sig == b'SLDX' else 0


def parse(data: bytes, wanted: set[int] | None = None) -> dict[int, Frame]:
    """Decodes the frames in `wanted` (all when None), as {index: Frame}.

    Every frame's blocks are still walked, because a frame can reuse blocks
    from the previous one; only wanted frames are turned into images.
    """
    sig, version, nframes, _, header_size = struct.unpack_from('<4s4H', data, 0)
    if sig != b'SLDX':
        raise ValueError('not an SLD file')
    # Usually 16; some files use 14. The first frame starts right after it.
    off = header_size
    frames: dict[int, Frame] = {}
    prev_grids: dict[int, np.ndarray] = {}
    for index in range(nframes):
        cw, ch, hx, hy, ftype, _, _ = struct.unpack_from('<4H2BH', data, off)
        keep = wanted is None or index in wanted
        off += 12
        frame = Frame(cw, ch, hx, hy)
        main_box = None
        for layer in (LAYER_MAIN, LAYER_SHADOW, LAYER_UNKNOWN, LAYER_DAMAGE, LAYER_PLAYER):
            if not ftype & layer:
                continue
            length, = struct.unpack_from('<I', data, off)
            start = off + 4
            off += length + ((4 - length) % 4)
            if layer == LAYER_UNKNOWN:
                continue
            p = start
            if layer in (LAYER_MAIN, LAYER_SHADOW):
                x1, y1, x2, y2, flag, _ = struct.unpack_from('<4H2B', data, p)
                p += 10
                box = (x1, y1, x2, y2)
                if layer == LAYER_MAIN:
                    main_box = box
            else:
                flag, _ = struct.unpack_from('<2B', data, p)
                p += 2
                box = main_box
            if box is None:
                continue
            cmds, p = _read_commands(data, p)
            draws = sum(d for _, d in cmds)
            raw = data[p:p + 8 * draws]
            wb, hb = (box[2] - box[0] + 3) // 4, (box[3] - box[1] + 3) // 4
            if layer in (LAYER_MAIN, LAYER_DAMAGE):
                blocks = decode_bc1(raw)
            else:
                blocks = decode_bc4(raw)
            prev = prev_grids.get(layer) if flag & FLAG_REUSE else None
            if prev is not None and prev.shape[:2] != (hb, wb):
                prev = None
            grid = _place(cmds, blocks, wb, hb, prev, None)
            prev_grids[layer] = grid
            if not keep:
                continue
            img = _grid_to_image(grid)[: box[3] - box[1], : box[2] - box[0]]
            canvas_shape = (ch, cw) + img.shape[2:]
            canvas = np.zeros(canvas_shape, dtype=np.uint8)
            canvas[box[1]:box[1] + img.shape[0], box[0]:box[0] + img.shape[1]] = img
            if layer == LAYER_MAIN:
                frame.main = canvas
            elif layer == LAYER_SHADOW:
                frame.shadow = canvas
            elif layer == LAYER_PLAYER:
                frame.player = canvas
            else:
                frame.extra['damage'] = canvas
        if keep:
            frames[index] = frame
    return frames
