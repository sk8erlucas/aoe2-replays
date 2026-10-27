# AoE2 Replays

Visor y herramienta de análisis open source para replays de Age of Empires II: Definitive Edition (`.aoe2record`).
Subís el archivo (sin necesidad de cuenta), lo ves reproducido en pixel art, lo analizás y lo exportás a video.

> Proyecto de fans. No afiliado a Microsoft, Xbox Game Studios ni World's Edge. Age of Empires es marca de sus dueños.

## Estado
Prototipo funcionando de punta a punta: subís un replay, el parser lo convierte a JSON, se guarda (privado, comprimido) y se reproduce en `/r/<id>`. Sin cuentas todavía; diseño provisional.

## Cómo iniciar (desarrollo)

Requisitos: Python 3.11+, Node 22+ y Docker (solo para la base de datos local).

```sh
# 1. Parser (terminal 1)
cd services/parser
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"      # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn aoe2_parser.api:app --port 8000

# 2. Base de datos (desde la raíz)
docker compose -f docker-compose.dev.yml up -d       # Postgres en localhost:5433

# 3. Web (terminal 2, desde la raíz)
npm install
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate -w apps/web
npm run dev:web                                      # http://localhost:3000
```

Tests: `npm test` en la raíz y `.venv/Scripts/python -m pytest` dentro de `services/parser`.

Producción (Dokploy): [`docs/DEPLOY.md`](./docs/DEPLOY.md). Guía para agentes de código: [`AGENTS.md`](./AGENTS.md).

## Estructura
| Carpeta | Contenido |
|---|---|
| [`services/parser`](./services/parser) | Parser en Python (`.aoe2record` → JSON) |
| [`apps/web`](./apps/web) | Web Next.js: subida y visor |
| [`apps/viewer`](./apps/viewer) | Prototipo estático del visor, sin build (para depurar) |
| [`packages/viewer`](./packages/viewer) | Motor de reproducción y render en canvas, compartido |
| [`packages/shared`](./packages/shared) | Tipos TypeScript del contrato JSON |
| [`fixtures`](./fixtures) | Replays de prueba (fuera del repo) |

## Documentación
| Archivo | Contenido |
|---|---|
| [`docs/CONTEXT.md`](./docs/CONTEXT.md) | Qué es el proyecto, hallazgos técnicos y límites |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Servicios, flujo de datos y stack |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Decisiones tomadas y preguntas abiertas |
| [`docs/LEGAL.md`](./docs/LEGAL.md) | Marcas, assets, publicidad y privacidad |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Despliegue en Dokploy y variables de entorno |

## Tareas por fase
| Fase | Archivo |
|---|---|
| 0. Preparación | [`tasks/00-preparacion.md`](./tasks/00-preparacion.md) |
| 1. Parser | [`tasks/01-parser.md`](./tasks/01-parser.md) |
| 2. Prototipo del visor | [`tasks/02-prototipo-visor.md`](./tasks/02-prototipo-visor.md) |
| 3. Web (Next.js) | [`tasks/03-web.md`](./tasks/03-web.md) |
| 4. Análisis | [`tasks/04-analisis.md`](./tasks/04-analisis.md) |
| 5. Exportar a video | [`tasks/05-video.md`](./tasks/05-video.md) |
| 6. Comunidad open source | [`tasks/06-comunidad.md`](./tasks/06-comunidad.md) |
| 7. Diseño visual | [`tasks/07-diseno.md`](./tasks/07-diseno.md) |
| **Pendientes (manual / automático)** | [`tasks/PENDIENTES.md`](./tasks/PENDIENTES.md) |

## Licencia
MIT, ver [`LICENSE`](./LICENSE).
