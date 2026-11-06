"""AoE2 Replays parser: .aoe2record -> normalized JSON."""

from aoe2_parser.parse import (
    SCHEMA_VERSION,
    CorruptReplay,
    ReplayError,
    UnsupportedVersion,
    parse_replay,
    parse_replay_json,
)

__all__ = ['SCHEMA_VERSION', 'CorruptReplay', 'ReplayError', 'UnsupportedVersion', 'parse_replay', 'parse_replay_json']
