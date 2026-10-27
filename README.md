# AoE2 Replays

Visor y herramienta de análisis open source para replays de Age of Empires II: Definitive Edition (`.aoe2record`).
Subís el archivo (sin necesidad de cuenta), lo ves reproducido en pixel art, lo analizás y lo exportás a video.

> Proyecto de fans. No afiliado a Microsoft, Xbox Game Studios ni World's Edge. Age of Empires es marca de sus dueños.

## Estado
Fase 1 casi completa y prototipo del visor (fase 2) funcionando.

- El parser ([`services/parser`](./services/parser)) convierte el replay de ejemplo (save 68.9) a JSON: jugadores, mapa, objetos iniciales, línea de tiempo de acciones, chat y nombres.
- El visor ([`apps/viewer`](./apps/viewer)) reproduce ese JSON en canvas: mapa pixel art, unidades, edificios, eventos y chat.

## Estructura
| Carpeta | Contenido |
|---|---|
| [`services/parser`](./services/parser) | Parser en Python (`.aoe2record` → JSON) |
| [`apps/viewer`](./apps/viewer) | Prototipo del visor (JS plano, canvas) |
| [`apps/web`](./apps/web) | Web Next.js (vacío) |
| [`packages/shared`](./packages/shared) | Tipos del contrato JSON (vacío) |
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

## Licencia
MIT, ver [`LICENSE`](./LICENSE).
