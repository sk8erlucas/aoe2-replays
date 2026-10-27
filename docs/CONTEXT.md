# Contexto

## Idea
Subir un `.aoe2record` y verlo como si se estuviera jugando (pixel art, gráficos simples al inicio que mejoran con el tiempo), con análisis y exportación a video. Open source, con mejoras continuas vía pull requests que se evalúan una por una.

## Objetivo del producto
Herramienta de análisis: además del visor, estadísticas, build orders y análisis por jugador.

## Hallazgos técnicos (replay de prueba, 26/10/2026)
- Archivo de ejemplo: ~1,99 MB. Estructura: 8 bytes (`header_len`, `next`) + header comprimido con deflate raw + cuerpo.
- El header descomprime a ~19 MB. Empieza con `VER 9.4`. Versión de guardado 68.9 (DE reciente), 8 jugadores.
- El cuerpo pesa ~90 KB: ~3.350 ticks de sincronización y 200 acciones (91 MOVE, 22 DE_QUEUE, 21 DE_TRANSFORM, 16 ORDER, 14 GAME, 13 RESIGN, 10 BUILD, 9 GATHER_POINT, 3 RESEARCH, 1 WALL) y 2 mensajes de chat.
- Librería probada: [`mgz`](https://github.com/happyleavesaoc/aoc-mgz) 1.8.51 (Python, MIT).
  - Cuerpo: se parsea bien con `mgz.fast` (acciones con `player_id`, `object_ids`, `x`, `y`).
  - Header: falla en `parse_de` (`de_string`, assert `0x600a`) porque la versión 68.9 es más nueva que la soportada. Hay que parchear los campos nuevos.
- Alternativa: crate Rust [`aoe2rec`](https://lib.rs/crates/aoe2rec) (MIT). Sin verificar si soporta 68.9.
- Posiciones vistas: BUILD (building_id 70) en (99, 209), (64, 19), (152, 182). El mapa parece grande (coordenadas de más de 200).

## Límite fundamental
Un replay guarda solo los comandos de los jugadores, no posiciones por fotograma. El juego vuelve a simular todo con un motor cerrado. No existe un motor open source que lo replique.
La reproducción será una aproximación:
- Mapa y objetos iniciales (a confirmar que el header los trae y se pueden leer).
- Línea de tiempo de comandos: edificios en sus coordenadas, unidades que van en línea recta a su destino, colas de producción, abandonos.
- Las unidades creadas durante la partida no tienen posición inicial conocida.

## Verificado (27/10/2026)
- El header 68.9 se parsea completo con dos parches a `mgz` (ver `services/parser/README.md`): un `de_string` extra al final de cada jugador y dos más al final de la sección DE.
- Trae el mapa (220×220, terreno y elevación por tile) y los objetos iniciales con posición: 33.647 de Gaia y 20 por jugador (TC, aldeanos, explorador, etc.).
- Los `object_ids` de las acciones coinciden con los `instance_id` de los objetos iniciales (ej. el TC 31035 investiga telar).
- Los ticks de sincronización son milisegundos de juego: suman 51.091 ms, igual al `world_time` del postgame. La partida de ejemplo dura ~51 s (todos abandonan temprano), así que sirve para tests pero poco para probar el visor.
- En 68.9, civilización/color/equipo de la sección de jugadores del header no son confiables (civ 96 en todos); se usan los de la sección DE.

## Aún sin verificar
- Soporte de `aoe2rec` para la versión 68.9.
- Que los parches no rompan replays de versiones 66.x / 67.x (falta tener fixtures).
