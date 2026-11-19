# 22: Puertas del mapa, abandonos y pestañas del panel

Pedidos de Lucas del 19/11/2026 después de ver `/m/522164674?p=397671` (4v4 Arena, 48 min, Dekaryn).

## Hecho (19/11/2026)
- [x] **Puertas que no se veían**: Arena (y otros mapas con fortaleza) arranca con murallas y puertas puestas. En el header cada puerta son tres objetos: la pieza del medio (`Gate (up.)` 64, `Gate (down.)` 88...) y dos postes (`Gate` 81, 95), ninguno con sprite. Ahora el motor dibuja la pieza del medio como la puerta que construye un jugador sobre el mismo eje (487 o 490, `drawAs`) y deja afuera los postes. Ojo: el motor trabaja con el mapa girado (`toGameOrientation`), así que ahí la 487 va a lo largo de `y`. Comprobado con la partida: las 3 puertas que los jugadores reconstruyeron encima de una del mapa son del mismo tipo que elige el motor.
  - Una puerta (4×1) se tomaba como un cuadrado de 4×4: una casa al lado la "borraba" (`#clearBuiltOver`). Las puertas quedan fuera de esa regla; una puerta nueva donde había otra sí la reemplaza.
- [x] **Abandonos**: antes, al rendirse, desaparecía todo lo del jugador. En el juego queda: los aldeanos dejan de trabajar, los soldados se quedan donde estaban, los edificios siguen en pie y lo que estaba en obra queda como estaba. Lo que estaba en cola no sale. Se sigue viendo más tenue.
- [x] **Pestañas en el panel de jugadores** (`V`): Aldeanos, Ejército, Recursos y Resumen. Se recuerda la elegida. Los equipos van separados con una línea.
  - **Recursos: datos reales.** Los `sync` del replay traen `total_res` por jugador (comida + madera + oro + piedra en reserva, cada ~17 s). Comparado con la partida: arranca en 400-515 al minuto y Dekaryn llega a ~22 000 al final. El parser lo da en `resource_totals` (campo opcional, sin cambiar `schema_version`). No viene separado por recurso.
  - **Ejército** (estimado): unidades militares vivas por tipo (infantería, arqueros, caballería, asedio, barcos, monjes), por la clase de la unidad en `game-data.json`. `Replay.armyAt(t)`.
  - **Resumen** (estimado): edad, población, investigaciones terminadas y edificios en pie. `Replay.overviewAt(t)`.
- [x] **Los paneles salen en el video** (pendiente de [21](./21-recorridos-constructores-y-paneles.md)): opción "Panel de jugadores" en la exportación, con la pestaña elegida, arriba a la derecha.
- Granjas: lo que se veía como "dejan de trabajar" eran los aldeanos sin animación en calidad baja (Lucas, 19/11). No se tocó.

## Falta
- [ ] **Probar en el navegador** (no hubo navegador en la sesión): las puertas de Arena en `/m/522164674`, las pestañas en escritorio y celular, el final de esa partida (los que se rinden ya no desaparecen) y el video con el panel.
- [x] **Partidas guardadas antes** (decidido por Lucas el 19/11/2026: solas). La tabla `matches` tiene `parser_revision`; al pedir los datos de una partida con una revisión anterior a `MATCH_PARSER_REVISION` (hoy 1), la web la vuelve a bajar de Microsoft, la parsea y la guarda (espera hasta 20 s; si no, da la copia vieja sin caché y la nueva queda para la próxima visita). Si Microsoft ya no la tiene, se marca para no reintentar. Cuenta para el límite global de descargas. Los replays subidos a mano no se pueden reprocesar (no se guarda el `.aoe2record`).
- [ ] Probar el reprocesado contra la base local (no hubo Docker en la sesión) y en producción con `/m/522164674`.
- [ ] Puntajes como los del juego (militar, economía, tecnología, sociedad): ahora la economía se podría acercar con `resource_totals` más lo gastado.
- [ ] Recursos separados (comida, madera, oro, piedra): el replay no los trae; habría que estimarlos.
