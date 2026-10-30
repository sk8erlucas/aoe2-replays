"""CLI: python -m aoe2_parser replay.aoe2record [-o out.json]"""

import argparse
import json
import sys

from aoe2_parser import ReplayError, parse_replay


def main():
    ap = argparse.ArgumentParser(prog='aoe2_parser', description='Parse a .aoe2record into JSON.')
    ap.add_argument('replay')
    ap.add_argument('-o', '--output', help='output file (default: stdout)')
    ap.add_argument('--pretty', action='store_true', help='indent the JSON')
    args = ap.parse_args()

    with open(args.replay, 'rb') as f:
        data = f.read()
    try:
        result = parse_replay(data)
    except ReplayError as e:
        print(f'error [{e.code}]: {e.message}', file=sys.stderr)
        sys.exit(1)

    text = json.dumps(
        result, ensure_ascii=False, indent=2 if args.pretty else None, separators=None if args.pretty else (',', ':')
    )
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
