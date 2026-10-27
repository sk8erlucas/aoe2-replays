# viewer (prototipo estático)

Página sin build para depurar el motor con un JSON local. Usa el motor y el render de [`packages/viewer`](../../packages/viewer); la web real está en [`apps/web`](../web).

## Uso

```sh
# 1. generar el JSON (desde services/parser)
.venv/Scripts/python -m aoe2_parser ../../fixtures/AgeIIDE_Replay_516585531.aoe2record -o ../../fixtures/sample.json

# 2. servir la raíz del repo y abrir el visor
python -m http.server 8765
# http://localhost:8765/apps/viewer/
```

Parámetros: `?src=<url del json>` y `?t=<segundos>` para abrir en un momento dado. También se puede abrir o arrastrar un JSON.

Controles: espacio para reproducir/pausar, flechas para ±5 s, rueda para zoom, arrastrar para mover el mapa, pasar el mouse para ver qué es cada cosa. La vista es isométrica y la cámara arranca cerca, siguiendo la acción. La web agrega selector de cámara, botones de zoom, WASD, +/− y minimapa.

Tests del motor: `npm test` en la raíz del repo.

## Archivos

| Archivo | Qué hace |
|---|---|
| [`packages/viewer/src/engine.js`](../../packages/viewer/src/engine.js) | Motor: estado de la partida en cualquier instante. Sin DOM. |
| [`packages/viewer/src/render.js`](../../packages/viewer/src/render.js) | Dibuja un estado en canvas. Cambiar el aspecto = cambiar este archivo. |
| [`packages/viewer/src/palette.js`](../../packages/viewer/src/palette.js) | Colores, tamaños, velocidades y tiempos (aproximaciones propias). |
| [`src/main.js`](src/main.js) | Carga, controles y panel lateral de esta página. |

## Qué es exacto y qué es aproximado

El replay guarda solo comandos, así que:

- **Exacto**: mapa, objetos iniciales, cuándo se da cada orden, dónde se ordena construir, investigaciones, abandonos, chat.
- **Aproximado**: las unidades van en línea recta a velocidad fija (sin pathfinding ni recolección); los edificios suben en un tiempo estimado con un solo constructor; las unidades entrenadas aparecen junto al edificio al terminar el tiempo de entrenamiento estimado y se vinculan a su ID la primera vez que reciben una orden (se dibujan con borde blanco).
- Un comando con `object_ids` vacío reusa la última selección del jugador.
- `color_id` es base 0 (0 azul … 7 naranja); se dedujo del chat del replay de ejemplo.
