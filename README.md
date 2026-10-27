# AoE2 Replays

Visor y herramienta de análisis open source para replays de Age of Empires II: Definitive Edition (`.aoe2record`).
Subís el archivo (sin necesidad de cuenta), lo ves reproducido en pixel art, lo analizás y lo exportás a video.

> Proyecto de fans. No afiliado a Microsoft, Xbox Game Studios ni World's Edge. Age of Empires es marca de sus dueños.

## Estado
Prototipo funcionando de punta a punta: subís un replay en la web, el parser lo convierte a JSON y se reproduce en el mapa. Todavía no se guarda nada (sin base de datos ni cuentas) y el diseño es provisional.

## Cómo iniciar

Requisitos: Python 3.11+ y Node 22+.

**1. Parser** (una vez para instalar, después solo el último comando):

```sh
cd services/parser
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"      # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn aoe2_parser.api:app --port 8000
```

**2. Web** (en otra terminal, desde la raíz del repo):

```sh
npm install
npm run dev:web
```

Abrí http://localhost:3000 y subí un `.aoe2record`. La web le pasa el archivo al parser (`PARSER_URL`, por defecto `http://127.0.0.1:8000`; ver `apps/web/.env.example`).

**Con Docker** (todo junto): `docker compose up --build` y abrir http://localhost:3000. Todavía sin probar: en la máquina de desarrollo el build falla por certificados SSL (ver [`tasks/PENDIENTES.md`](./tasks/PENDIENTES.md)).

**Tests**: `npm test` en la raíz (motor del visor) y `.venv/Scripts/python -m pytest` dentro de `services/parser`.

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
