# AGENTS.md

Guía para agentes de código (Claude Code, Codex, Copilot, etc.) que trabajan en este repo. Las personas también pueden leerla: resume cómo está armado el proyecto y qué reglas no se rompen.

## Qué es
AoE2 Replays: subís un replay de Age of Empires II: DE (`.aoe2record`), se convierte a JSON y se reproduce en un mapa en el navegador. Proyecto de fans, open source (MIT), no afiliado a Microsoft.

Contexto y decisiones: [`docs/CONTEXT.md`](docs/CONTEXT.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Tareas: [`tasks/`](tasks/), empezando por [`tasks/PENDIENTES.md`](tasks/PENDIENTES.md).

## Estructura (monorepo)
| Carpeta | Qué es | Stack |
|---|---|---|
| `services/parser` | `.aoe2record` → JSON. CLI y API HTTP sin estado | Python 3.11+, FastAPI, `mgz` |
| `apps/web` | Web: subida, guardado, página `/r/<id>` con el visor | Next.js 15 (App Router), TypeScript, Prisma 7, Postgres |
| `packages/viewer` | Motor de reproducción y análisis (sin DOM) y render en canvas | JavaScript ESM + `index.d.ts` |
| `packages/shared` | Tipos TypeScript del contrato JSON del parser | Solo tipos |
| `apps/viewer` | Prototipo estático del visor para depurar, sin build | HTML + JS |
| `fixtures` | Replays de prueba, **fuera de git** | |

Flujo: navegador → `POST /api/replays` (web) → `POST /parse` (parser) → la web guarda el JSON comprimido con gzip en Postgres → `/r/<id>` lo descarga y lo reproduce.

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
- No usar ni extraer imágenes, sonidos, íconos ni datos de los archivos del juego. Sprites y colores, propios.
- `aocref` (aoc-reference-data) no tiene licencia publicada: usarlo solo como dependencia instalada, nunca copiar sus datos al repo.
- No poner "Age of Empires" como marca principal; mantener el aviso de "no afiliado".

**Privacidad.**
- No commitear replays (`fixtures/*.aoe2record` está en `.gitignore`): tienen nombres y perfiles de jugadores.
- Los replays se guardan privados por defecto. Un replay privado responde 404 igual que uno inexistente.
- No se guarda el `.aoe2record`, solo el JSON. No se guardan IPs en claro: se usa un HMAC con `IP_HASH_SECRET`.
- El token de gestión se guarda solo como hash SHA-256; el enlace de gestión lo lleva en el fragmento (`#k=`) para que no llegue al servidor ni a los logs.
- Texto que viene del replay (nombres, chat) se muestra siempre como texto: nada de `innerHTML` ni `dangerouslySetInnerHTML`.

**Base de datos.** Cambios de esquema solo con migraciones de Prisma (`npm run db:migrate -w apps/web -- --name <cambio>`), commiteadas en `apps/web/prisma/migrations`. En producción se aplican solas con el servicio `migrate` del compose. El cliente generado (`apps/web/src/generated`) no se commitea.

**Visor y análisis.** `packages/viewer/src/engine.js` y `analysis.js` no pueden tocar el DOM (se testean en Node). Todo lo visual va en `render.js`, y los números estimados (velocidades, tiempos) en `palette.js`. El replay guarda solo comandos, así que todo lo que el motor infiere es aproximado: documentarlo cuando se agregue algo.

## Estilo
- Código, identificadores y comentarios en inglés. Documentación, textos de la interfaz y mensajes al usuario en español rioplatense.
- Comentarios solo donde el porqué no es obvio. Seguir el estilo del archivo que se toca.
- Python: comillas simples, módulos chicos, errores con `ReplayError` y un `code` estable.
- TypeScript: estricto, sin `any`; componentes cliente solo donde hace falta (`"use client"`).
- Dependencias con versión exacta o acotada; registrar las nuevas en `docs/LEGAL.md` si cambian algo de licencias.

## Despliegue
Dokploy, con `docker-compose.yml` en la raíz: servicios `parser`, `migrate` y `web`. Pasos y variables en [`docs/DEPLOY.md`](docs/DEPLOY.md).
