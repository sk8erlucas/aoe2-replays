# parser

Convierte un `.aoe2record` (AoE2: DE) en el JSON normalizado que consume el visor.

## Uso

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # en Linux/macOS: .venv/bin/python
.venv/Scripts/python -m aoe2_parser ../../fixtures/AgeIIDE_Replay_516585531.aoe2record -o out.json --pretty
.venv/Scripts/python -m pytest
```

Desde código: `aoe2_parser.parse_replay(data: bytes) -> dict`. Lanza `UnsupportedVersion` o `CorruptReplay` (ambas `ReplayError`, con un `code` estable). `parse_replay_json(data)` devuelve el JSON ya serializado y además rechaza `NaN` e `Infinity`; es lo que usa la API.

Errores de `POST /parse`, siempre como `{ "error": { "code", "message" } }`: 400 y 422 (archivo inválido), 413 (`too_large`), 500 (`parser_error`), 503 (`parser_unavailable`: murió un worker y el pool se reinició, se puede reintentar) y 504 (`timeout`).

Límites contra archivos armados a propósito: el header descomprimido no puede pasar de 256 MB (`MAX_HEADER_BYTES`) y el reloj de la partida de 7 días (`MAX_DURATION_MS`). Los mensajes de chat que no cumplen el contrato se descartan. `tests/test_malformed.py` incluye un fuzz con semilla que necesita el replay de `fixtures/`: `FUZZ_RUNS=2000 FUZZ_SEED=7 python -m pytest tests/test_malformed.py -k fuzz`.

## Cómo funciona

- **Cuerpo**: `mgz.fast` (acciones, sync, chat, postgame). El tiempo `t` de cada evento es la suma de los incrementos de sync, en ms de juego.
- **Chat**: se pasa tal cual. Además de lo que escriben los jugadores trae avisos del propio juego, en el idioma de quien grabó y con un marcador del jugador: `"<player_id,5,0> advanced to the Feudal Age."` (en DE, sin `destinationMap`). El visor los separa (`packages/viewer/src/notices.js`) y los usa como hora exacta de llegada a cada edad.
- **Header**: copia parcheada de `mgz/fast/header.py` en [`vendor/mgz_header.py`](src/aoe2_parser/vendor/mgz_header.py) (MIT, ver `LICENSE.mgz`). `mgz` 1.8.51 soporta hasta save 66.6; los parches están marcados con `aoe2-replays patch`:
  - 68.9: cada registro de jugador en la sección DE termina con un `de_string` extra.
  - 68.9: el final de la sección DE trae dos `de_string` más antes del último.
- Civilización, color y equipo salen de la sección DE (en la sección de jugadores del header esos campos no son confiables en 68.9). Posiciones iniciales y objetos salen de la sección de jugadores.

## Contrato (schema_version 1)

```jsonc
{
  "schema_version": 1,
  "game": {
    "game_version": "VER 9.4", "save_version": 68.9, "build": 185872,
    "untested_version": false,      // save más nuevo que el último probado
    "duration_ms": 51091, "world_time_ms": 51091, "speed": 1.69,
    "population_limit": 200, "victory_type_id": 1, "starting_age_id": 0,
    "treaty_length": 0, "multiplayer": true,
    "players": [{ "number": 1, "name": "…", "profile_id": 123, "civilization_id": 28, "civilization": "Khmer",
                  "color_id": 1, "team_id": 2, "is_ai": false, "start": { "x": 121, "y": 22 } }]
  },
  "map": { "id": 12, "name": "Black Forest", "size": 220, "terrain": [/* size*size */], "elevation": [/* size*size */] },
  "initial_objects": [{ "id": 31035, "player": 1, "type_id": 109, "class_id": 80, "x": 121, "y": 22 }],
  "timeline": [{ "t": 3187, "type": "RESEARCH", "player": 1, "technology_id": 22, "object_ids": [31035] }],
  "chat": [{ "t": 31454, "player": 3, "channel": 0, "message": "gg" }],
  // Solo los IDs que aparecen en esta partida. name puede ser null si aocref no lo conoce.
  "legend": {
    "terrain": { "113": { "name": null, "category": "forest" } },
    "objects": { "66": { "name": "Gold Mine", "category": "gold" } },
    "technologies": { "22": "Loom" }
  }
}
```

`terrain` y `elevation`: el tile (x, y) está en el índice `y * size + x`. `color_id` es base 0 (0 azul … 7 naranja). Categorías de terreno: `grass forest water deep_water shallows sand road snow farm rock`; de objetos: `tree gold stone berries relic animal unit building decoration`. Los nombres salen de `aocref` (instalado, no copiado: no tiene licencia publicada); las categorías y los overrides para IDs nuevos están en [`reference.py`](src/aoe2_parser/reference.py). Los campos de cada evento del `timeline` dependen del `type` (los que da `mgz.fast`, con `player_id` renombrado a `player`).

## Pendiente

Servicio FastAPI con límites de tiempo y memoria, más fixtures de otras versiones, ver [`tasks/01-parser-completed.md`](../../tasks/01-parser-completed.md).
