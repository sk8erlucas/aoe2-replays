# 18: Visores de partida

> 18/11/2026: el motor ya tiene `Replay.researches` (cada investigación con su edificio e inicio y fin estimados con el tiempo del juego), que es lo que necesita el panel de investigaciones en curso. Y los `sync` del replay traen `total_res` por jugador, que podría dar recursos reales (ver [20](./20-aldeanos-parados-y-visor.md)).

**Objetivo:** paneles arriba del visor, que cada uno elige y ordena, con lo que pasa en la partida en cada momento: cuántos aldeanos tiene cada jugador y en qué recurso está cada grupo, y los puntajes como los que muestra el juego arriba del minimapa. La idea es parecerse al panel del modo espectador del juego (y a herramientas de casteo como Capture Age), pero en el navegador y sobre la repetición.

## Visores
- [x] **Aldeanos por recurso**, por jugador (18/11/2026, [21](./21-recorridos-constructores-y-paneles.md)): total y cuántos en comida, madera, oro, piedra y construyendo (y ociosos, si el motor lo puede saber). Con la muestra de color del jugador al lado del nombre, nunca el nombre en color.
- [ ] **Puntajes**, por jugador, como arriba del minimapa del juego: total y, al desplegar, militar, economía, tecnología y sociedad.
- [x] Otros que salen del motor y el análisis (19/11/2026, [22](./22-puertas-abandonos-y-pestanas.md)): pestañas Ejército (por tipo), Recursos (reales, de los `sync` del replay) y Resumen (edad, población, investigaciones, edificios). Falta el APM del momento. Recursos por tipo (estimados, ajustados al total) desde el 20/11/2026 ([23](./23-recursos-cancelaciones-y-exactitud.md)).
- [x] Equipos agrupados en partidas por equipos (separados con una línea).
- [x] **Investigaciones en curso del jugador seguido** (18/11/2026, sin íconos todavía) (pedido de Lucas, 16/11/2026): cuando la cámara sigue a un jugador, arriba a la izquierda la fila de íconos de lo que está investigando, cada uno con su barra de progreso, como en el juego. Al terminar, el ícono se va (y se puede marcar un momento "listo"). También las edades en curso.
  - Datos: el motor ya pone las investigaciones en la cola del edificio (`#occupy` en `engine.js`, con `RESEARCH_TIMES` de `palette.js`). Falta guardar cada una con inicio y fin (la cola del edificio la puede atrasar) y exponer `researchAt(player, t)` → `[{ tech, building, start, end }]`, sin DOM y con tests. Tiempos de `game-data.json` si `tools/sprites` los puede sacar (hoy salen de `palette.js`); sin bonus de civilización ni de universidad, así que es estimado.
  - Cancelaciones: el replay no siempre trae la cancelación; si el edificio recibe otra orden de investigar o entrenar que no entra en la cola, revisar.
  - Íconos: los de tecnologías del juego (arte oficial, extraído con `tools/sprites` y registrado en `CREDITS.md`); si falta el ícono, el nombre corto.
  - Dónde: dentro del mapa, arriba a la izquierda, solo con "Seguir a"; en celular, una fila chica que no tape el mapa.

## Configuración
- [ ] Elegir qué visores se ven y en qué orden (arrastrar o subir y bajar), y si van arriba o al costado.
- [ ] Guardarlo en el navegador, y en la cuenta si hay sesión.
- [ ] Atajo para mostrarlos u ocultarlos (sumarlo a la ayuda de `?`).
- [ ] Celular: versión compacta (una fila que se desliza) o desplegable, sin tapar el mapa.
- [x] Que salgan en la exportación a video ([05](./05-video.md)), con opción de sacarlos (19/11/2026).

## De dónde salen los datos
El replay guarda solo las órdenes: todo esto es una estimación del motor y hay que decirlo en la interfaz (como ya se hace con lo estimado).
- **Aldeanos por recurso:** `engine.js` ya lleva `gatherers` (qué junta cada unidad) con tasas de `palette.js`. Falta exponer un resumen por jugador en el instante `t` (función sin DOM, testeable en Node).
- **Puntajes:** el replay no los trae y el juego los calcula con su motor. Se pueden aproximar con las mismas reglas del juego: tecnología (investigaciones hechas), economía (recursos juntados, estimados), sociedad (maravillas, castillos, reliquias) y militar (unidades y edificios destruidos, que en combate es lo menos exacto). Mostrarlos como "estimado" y explicar en un tooltip cómo se calculan. Si el desvío es muy grande, mostrar solo los componentes confiables.
- Comparar contra partidas reales: anotar los puntajes y aldeanos que muestra el juego en algunos momentos de un replay de `fixtures/` y medir la diferencia.

## Reglas del repo
- Textos en `apps/web/src/i18n/messages.ts`, en español e inglés.
- Estilo de [`docs/DESIGN.md`](../docs/DESIGN.md).
- El cálculo en `packages/viewer` (sin DOM, con tests); el dibujo y los paneles en la web.

## Criterio de terminado
- [ ] Se pueden elegir y ordenar los visores, y la elección se recuerda.
- [ ] Aldeanos por recurso y puntajes se ven en partidas 1v1 y por equipos, en escritorio y celular.
- [ ] Lo estimado está marcado como tal y medido contra al menos una partida real.
