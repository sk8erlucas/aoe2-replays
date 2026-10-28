# AGENTS.md

Guía para agentes de código (Claude Code, Codex, Copilot, etc.) que trabajan en este repo. Las personas también pueden leerla: resume cómo está armado el proyecto y qué reglas no se rompen.

## Qué es
AoE2 Replays: subís un replay de Age of Empires II: DE (`.aoe2record`), se convierte a JSON y se reproduce en un mapa en el navegador. Proyecto de fans, open source (MIT), no afiliado a Microsoft.

Contexto y decisiones: [`docs/CONTEXT.md`](docs/CONTEXT.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Tareas: [`tasks/`](tasks/), empezando por [`tasks/PENDIENTES.md`](tasks/PENDIENTES.md).

## Estructura (monorepo)
| Carpeta | Qué es | Stack |
|---|---|---|
| `services/parser` | `.aoe2record` → JSON. CLI y API HTTP sin estado | Python 3.11+, FastAPI, `mgz` |
| `apps/web` | Web: portada, subida (`/r/<id>`), búsqueda de jugadores (`/p/<id>`), partidas online (`/m/<id>`), visor y análisis | Next.js 15 (App Router), TypeScript, Prisma 7, Postgres |
| `packages/viewer` | Motor de reproducción y análisis (sin DOM) y render en canvas | JavaScript ESM + `index.d.ts` |
| `packages/shared` | Tipos TypeScript del contrato JSON del parser | Solo tipos |
| `apps/viewer` | Prototipo estático del visor para depurar, sin build | HTML + JS |
| `tools/sprites` | Extrae los gráficos del juego a atlas WebP + `manifest.json` (`apps/web/public/sprites`); requiere el juego instalado | Python, numpy, Pillow, genieutils-py |
| `fixtures` | Replays de prueba, **fuera de git** | |

Flujos:
- Subida: navegador → `POST /api/replays` (web) → `POST /parse` (parser) → la web guarda el JSON comprimido con gzip en Postgres (tabla `replays`, privado) → `/r/<id>` lo reproduce.
- Partida online: `/p/<profileId>` lista partidas (aoe2companion, con caché) → `POST /api/matches/<matchId>` descarga el ZIP de Microsoft, lo parsea y lo guarda una vez (tabla `matches`, público) → `/m/<matchId>` lo reproduce.

## Comandos
```sh
# Parser (desde services/parser)
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m pytest
.venv/Scripts/python -m uvicorn aoe2_parser.api:app --port 8000
.venv/Scripts/python -m aoe2_parser ../../fixtures/<replay>.aoe2record -o out.json --pretty

# DB local (desde la raíz)
docker compose -f docker-compose.dev.yml up -d      # Postgres en localhost:5433

# Web y paquetes (desde la raíz)
npm install                       # también corre `prisma generate`
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate -w apps/web    # aplica/crea migraciones en la DB local
npm run dev:web                   # http://localhost:3000
npm test                          # tests del motor del visor (node --test)
npm run lint -w apps/web && npm run typecheck -w apps/web
npm run build -w apps/web
```
Antes de dar algo por terminado: tests del parser, `npm test`, lint, typecheck y build de la web. El CI (`.github/workflows/ci.yml`) corre lo mismo y además construye las imágenes de Docker.

## Reglas
**Contrato JSON.** El JSON del parser es la interfaz entre servicios. Si cambia:
1. Actualizar `services/parser/README.md` (fuente de verdad), `packages/shared/src/index.d.ts` y los tests.
2. Un cambio incompatible sube `SCHEMA_VERSION` en `services/parser/src/aoe2_parser/parse.py`. Los replays guardados tienen su `schema_version` en la DB: la web tiene que seguir pudiendo mostrarlos o migrarlos.

**Parser.** `services/parser/src/aoe2_parser/vendor/mgz_header.py` es una copia parcheada de `mgz` (MIT): marcar cada cambio con `aoe2-replays patch`, y no tocar `LICENSE.mgz`. Las versiones nuevas del juego se soportan agregando parches con condición `if save >= X`, sin romper las anteriores.

**Legal y assets.**
- El arte y los gráficos del juego se usan bajo las Game Content Usage Rules de Microsoft (ver `docs/LEGAL.md`): solo arte oficial, cada archivo registrado en `apps/web/public/images/CREDITS.md`, y el aviso de las reglas siempre visible en el pie de la web.
- `aocref` (aoc-reference-data) no tiene licencia publicada: usarlo solo como dependencia instalada, nunca copiar sus datos al repo.
- No poner "Age of Empires" como marca principal; mantener el aviso de "no afiliado".

**Privacidad.**
- No commitear replays (`fixtures/*.aoe2record` está en `.gitignore`): tienen nombres y perfiles de jugadores.
- Los replays se guardan privados por defecto. Un replay privado responde 404 igual que uno inexistente.
- No se guarda el `.aoe2record`, solo el JSON. No se guardan IPs en claro: se usa un HMAC con `IP_HASH_SECRET`.
- El token de gestión se guarda solo como hash SHA-256; el enlace de gestión lo lleva en el fragmento (`#k=`) para que no llegue al servidor ni a los logs.
- Texto que viene del replay (nombres, chat) se muestra siempre como texto: nada de `innerHTML` ni `dangerouslySetInnerHTML`.

**Base de datos.** Cambios de esquema solo con migraciones de Prisma (`npm run db:migrate -w apps/web -- --name <cambio>`), commiteadas en `apps/web/prisma/migrations`. En producción se aplican solas con el servicio `migrate` del compose. El cliente generado (`apps/web/src/generated`) no se commitea.

**Visor y análisis.** `packages/viewer/src/engine.js` y `analysis.js` no pueden tocar el DOM (se testean en Node). Todo lo visual va en `render.js` (proyección isométrica 2:1: `u = x - y`, `v = (x + y) / 2 - z`; cámara con seguimiento y minimapa), y los números estimados (velocidades, tiempos) en `palette.js`. Los sprites del juego vienen de `apps/web/public/sprites` (generados por `tools/sprites`) y los carga `sprites.js`; cada `#sprite*` del render devuelve `false` si no hay sprite y entonces se dibuja la forma propia. El replay guarda solo comandos, así que todo lo que el motor infiere es aproximado: documentarlo cuando se agregue algo.

## Estilo
- Interfaz: seguir [`docs/DESIGN.md`](docs/DESIGN.md) (tokens en `apps/web/src/app/globals.css`). El color de jugador va en una muestra al lado del nombre, nunca como color de texto.
- Código, identificadores y comentarios en inglés. Documentación interna en español rioplatense; README público en inglés con versión en español (`README.es.md`).
- **Interfaz bilingüe (español e inglés)**: todo texto visible va en `apps/web/src/i18n/messages.ts`, en los dos idiomas (el tipo `Messages` obliga a que tengan las mismas claves). Nada de texto suelto en los componentes. El idioma sale de la cookie `lang` o del navegador; la API devuelve códigos de error y la interfaz los traduce.
- Comentarios solo donde el porqué no es obvio. Seguir el estilo del archivo que se toca.
- Python: comillas simples, módulos chicos, errores con `ReplayError` y un `code` estable.
- TypeScript: estricto, sin `any`; componentes cliente solo donde hace falta (`"use client"`).
- Dependencias con versión exacta o acotada; registrar las nuevas en `docs/LEGAL.md` si cambian algo de licencias.

## Despliegue
Dokploy, con `docker-compose.yml` en la raíz: servicios `parser`, `migrate` y `web`. Pasos y variables en [`docs/DEPLOY.md`](docs/DEPLOY.md).
