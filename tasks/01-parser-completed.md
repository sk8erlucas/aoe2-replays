# Fase 1: Parser

Objetivo: convertir un `.aoe2record` en un JSON normalizado que consuma el visor.

- [x] Parsear el cuerpo del replay de ejemplo con `mgz.fast` y volcar las acciones a JSON
- [x] Parchear el header para la versión 68.9 (campos nuevos en `parse_de`)
- [x] Sacar del header: jugadores, civilizaciones, equipos, mapa y tamaño
- [x] Confirmar si el header trae tiles del mapa y objetos iniciales con posiciones
- [x] Mapear los `object_ids` de las acciones a los objetos iniciales del header
- [x] Averiguar la unidad de tiempo de los ticks de sincronización y calcular la duración real
- [x] Evaluar `aoe2rec` (Rust) como alternativa o compilarlo a WASM: descartado, ver `docs/DECISIONS.md` (12/11/2026)
- [x] Definir y versionar el contrato JSON (`schema_version`)
- [x] Servicio FastAPI (`POST /parse`, `GET /health`) con límite de tamaño y tiempo; memoria limitada desde el contenedor
- [x] Manejar errores: versión no soportada, archivo corrupto, archivo truncado
- [x] Tests con los replays de `fixtures/`: 4v4 corto, 4v4 completo de 48 min y 1v1 de 23 min (Hera, build 188329), el 12/11/2026
- [→] Contemplar versiones nuevas del juego: hoy se intenta parsear y se marca `untested_version`. Probado con un build nuevo (188329, sigue siendo save 68.9) sin cambios; falta una versión con save distinto cuando salga
- [x] Traducir IDs a nombres (via `aocref` instalado) y categorías propias para el visor (`legend`)
- [x] Completar nombres de IDs nuevos que `aocref` no tiene: `NAME_OVERRIDES` en `reference.py`, sacados del `.dat` y la tabla de textos del juego (12/11/2026). Los árboles talados ahora caen en la categoría `tree`
- [→] Revisar si conviene proponer los parches de 68.9 a `mgz` upstream

Cerrado el 12/11/2026. Lo marcado con `[→]` pasó a [`PENDIENTES.md`](./PENDIENTES.md).
