# viewer (prototipo)

Visor en canvas del JSON que genera el parser. JavaScript plano con módulos ES, sin paso de build. Cuando exista `apps/web`, el motor y el render se mudan ahí.

## Uso

```sh
# 1. generar el JSON (desde services/parser)
.venv/Scripts/python -m aoe2_parser ../../fixtures/AgeIIDE_Replay_516585531.aoe2record -o ../../fixtures/sample.json

# 2. servir la raíz del repo y abrir el visor
python -m http.server 8765
# http://localhost:8765/apps/viewer/
```

Parámetros: `?src=<url del json>` y `?t=<segundos>` para abrir en un momento dado. También se puede abrir o arrastrar un JSON.

Controles: espacio para reproducir/pausar, flechas para ±5 s, rueda para zoom, arrastrar para mover el mapa, pasar el mouse para ver qué es cada cosa.

Tests del motor: `npm test` (usa `node --test`, sin dependencias).

## Archivos

| Archivo | Qué hace |
|---|---|
| [`src/engine.js`](src/engine.js) | Motor: estado de la partida en cualquier instante. Sin DOM. |
| [`src/render.js`](src/render.js) | Dibuja un estado en canvas. Cambiar el aspecto = cambiar este archivo. |
| [`src/palette.js`](src/palette.js) | Colores, tamaños, velocidades y tiempos (aproximaciones propias). |
| [`src/main.js`](src/main.js) | Carga, controles, panel lateral. |

## Qué es exacto y qué es aproximado

El replay guarda solo comandos, así que:

- **Exacto**: mapa, objetos iniciales, cuándo se da cada orden, dónde se ordena construir, investigaciones, abandonos, chat.
- **Aproximado**: las unidades van en línea recta a velocidad fija (sin pathfinding ni recolección); los edificios suben en un tiempo estimado con un solo constructor; las unidades entrenadas aparecen junto al edificio al terminar el tiempo de entrenamiento estimado y se vinculan a su ID la primera vez que reciben una orden (se dibujan con borde blanco).
- Un comando con `object_ids` vacío reusa la última selección del jugador.
- `color_id` es base 0 (0 azul … 7 naranja); se dedujo del chat del replay de ejemplo.
