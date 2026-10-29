<div align="center">

# AoE2 Replays

**Watch and analyze Age of Empires II: Definitive Edition matches in your browser.**

Upload a replay or search for any player, and play their match back on the map with the game's own graphics: every civilization's architecture, villagers at work, armies on the move. Then see what each player did and when.

[**Open the app →**](https://aoe2replays.sitemaster.com.ar/) · [Español](README.es.md) · [Contributing](CONTRIBUTING.md)

![The viewer in Imperial Age: a Central Asian city, a Japanese castle and an army, with the analysis panel open](docs/screenshots/viewer-analysis.webp)

</div>

## Features

| | |
|---|---|
| ![Villagers farming next to a Cuman base](docs/screenshots/farms.webp) | **Watch it like in the game.** Isometric view with the game's sprites: buildings by civilization and age, villagers chopping, mining, farming and building, trained units coming out of the right building, trees falling as they're cut. The camera follows the action on its own, or follows the player you pick. |
| ![Whole map of an 8-player match](docs/screenshots/map.webp) | **The whole map at a glance.** Zoom out to see how the map is split, jump anywhere with the minimap and anywhere in time with the timeline. Share a moment with `?t=<seconds>`. |
| ![Home page with player search](docs/screenshots/home.webp) | **Online matches, no upload needed.** Search any player (autocomplete), see their ratings and recent matches, and open any of them: the replay is fetched from Microsoft's public replay service. |

And also:
- **Analysis**: APM, when each player clicked up to each age, activity over time, and a clickable build order for every player.
- **Chat** with a jump to the moment each message was sent.
- **Ask an AI**: copy the match as text (summary or every command) to paste into ChatGPT, Claude or any other AI.
- **Private by default**: uploaded replays are only visible with their management link until you make them public; only the match data is stored (never the file), and it expires after 30 days.
- **English and Spanish**, picked from your browser and switchable at any time.

### What's exact and what's estimated
A replay stores **only the players' commands**: the game re-simulates everything with its closed-source engine. So commands, timings, what was built where, research, resignations and chat are **exact**; unit paths, gathering, hunting, tree felling, fights (who attacks whom is exact, the outcome is not) and age-up arrival times are **estimates**, and the app says so where it matters.

## How it works

```
.aoe2record ──► parser (Python) ──► JSON ──► web (Next.js) ──► viewer (canvas)
                    ▲                          │
Microsoft replay ───┘                          └─► PostgreSQL (gzip JSON)
service (online matches)
```

| Folder | What it is | Stack |
|---|---|---|
| [`services/parser`](services/parser) | Reads `.aoe2record` into a documented JSON format. CLI and HTTP API | Python, FastAPI, [`mgz`](https://github.com/happyleavesaoc/aoc-mgz) (patched for recent game versions) |
| [`apps/web`](apps/web) | The web app: home, uploads, player search, matches, viewer, analysis | Next.js, TypeScript, Prisma, PostgreSQL |
| [`packages/viewer`](packages/viewer) | Replay engine (estimates movement, gathering, building) and isometric canvas renderer | JavaScript, no dependencies |
| [`packages/shared`](packages/shared) | Types for the parser's JSON format | TypeScript |
| [`tools/sprites`](tools/sprites) | Extracts the game's graphics (SLD) and data into WebP atlases | Python |

The parser's JSON format is documented in [`services/parser/README.md`](services/parser/README.md), in case you want to build your own tools on top of it.

## Run it locally

Requires Python 3.11+, Node 22+ and Docker (for the database).

```sh
# 1. Parser (terminal 1)
cd services/parser
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"      # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn aoe2_parser.api:app --port 8000

# 2. Database (from the repo root)
docker compose -f docker-compose.dev.yml up -d       # PostgreSQL on localhost:5433

# 3. Web (terminal 2, from the repo root)
npm install
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate -w apps/web
npm run dev:web                                      # http://localhost:3000
```

Tests: `npm test` at the root, and `.venv/Scripts/python -m pytest` inside `services/parser`. Deployment (Docker Compose, e.g. on Dokploy): [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Contributing

Contributions are welcome and every pull request is reviewed. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) — and [`AGENTS.md`](AGENTS.md) if you use a coding agent. The roadmap lives in [`tasks/`](tasks) (in Spanish), starting with [`tasks/PENDIENTES.md`](tasks/PENDIENTES.md). Found a security issue? See [`SECURITY.md`](SECURITY.md).

## Credits and legal

- Replay reading: [`mgz`](https://github.com/happyleavesaoc/aoc-mgz) by happyleavesaoc (MIT), and reference data from [aoc-reference-data](https://github.com/SiegeEngineers/aoc-reference-data).
- Player and match data: [aoe2companion](https://www.aoe2companion.com).
- Game data file reading for the sprite tool: [genieutils-py](https://github.com/SiegeEngineers/genieutils-py) (LGPL, development tool only).
- Fonts: Cinzel and Montserrat (SIL Open Font License).

Age of Empires II © Microsoft Corporation. AoE2 Replays was created under Microsoft's "[Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules)" using assets from Age of Empires II, and it is not endorsed by or affiliated with Microsoft. The game's art and sprites are **not** covered by this project's license; see [`apps/web/public/images/CREDITS.md`](apps/web/public/images/CREDITS.md).

The code is released under the [MIT license](LICENSE).
