"""Fixes to mgz's action parsing (mgz.fast.actions, MIT, see LICENSE.mgz).

aoe2-replays patch: in save 68.9 a SPECIAL action has 29 bytes before its object
IDs, not the 28 that mgz 1.8.51 reads, so every ID came out shifted one byte
(28824 read as 7378944). The IDs are the last `selected` * 4 bytes, whatever
the header size, so they are read from the end.
"""

import struct

from mgz import fast
from mgz.fast.enums import Action

_original = fast.parse_action_71094


def _special(raw):
    selected, target_id, x, y, slot_id, order_id = struct.unpack_from('<Iiff4xh2xh', raw)
    start = len(raw) - 4 * selected
    if selected > 255 or start < 26:
        raise struct.error('bad SPECIAL action')
    object_ids = list(struct.unpack_from(f'<{selected}I', raw, start))
    return dict(order_id=order_id, slot_id=slot_id, target_id=target_id, x=x, y=y, object_ids=object_ids)


def parse_action_71094(action_type, player_id, raw):
    if action_type is Action.SPECIAL:
        return dict(player_id=player_id, **_special(raw))
    return _original(action_type, player_id, raw)


def install():
    """mgz.fast.parse_action calls the module-level name: point it here."""
    fast.parse_action_71094 = parse_action_71094
