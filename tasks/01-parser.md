# Fase 1: Parser

Objetivo: convertir un `.aoe2record` en un JSON normalizado que consuma el visor.

- [x] Parsear el cuerpo del replay de ejemplo con `mgz.fast` y volcar las acciones a JSON
- [x] Parchear el header para la versión 68.9 (campos nuevos en `parse_de`)
- [x] Sacar del header: jugadores, civilizaciones, equipos, mapa y tamaño
- [x] Confirmar si el header trae tiles del mapa y objetos iniciales con posiciones
- [x] Mapear los `object_ids` de las acciones a los objetos iniciales del header
- [x] Averiguar la unidad de tiempo de los ticks de sincronización y calcular la duración real
- [ ] Evaluar `aoe2rec` (Rust) como alternativa o compilarlo a WASM
- [x] Definir y versionar el contrato JSON (`schema_version`)
- [x] Servicio FastAPI (`POST /parse`, `GET /health`) con límite de tamaño y tiempo; memoria limitada desde el contenedor
- [x] Manejar errores: versión no soportada, archivo corrupto, archivo truncado
- [~] Tests con los replays de `fixtures/`: hay un 4v4 corto; faltan 1v1 y una partida completa
- [~] Contemplar versiones nuevas del juego: hoy se intenta parsear y se marca `untested_version`; falta probar contra una versión nueva real
- [x] Traducir IDs a nombres (via `aocref` instalado) y categorías propias para el visor (`legend`)
- [ ] Completar nombres de IDs nuevos que `aocref` no tiene (terreno 113, objetos 1984, 1902, 1909, 2098...)
- [ ] Revisar si conviene proponer los parches de 68.9 a `mgz` upstream
