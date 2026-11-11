# 15: Orientación del mapa, chat, IA por jugador y herramientas

Reportes de jugadores del 11/11/2026. Se investigó cada uno con datos antes de tocar nada.

## Mapa girado
Reporte: "esta página muestra el mapa girado". **Cierto.**
- Guía de RMS de Zetnus: "land_position 0 0 is the west corner, 99 99 is the east corner, 99 0 is the north corner". En el juego (0, 0) es la esquina izquierda, x crece hacia arriba a la derecha e y hacia abajo a la derecha: `u = x + y`, `v = (y - x) / 2`.
- El render usaba `u = x - y`, `v = (x + y) / 2`: (0, 0) arriba, el mapa girado 90° en sentido horario.
- Las puertas lo confirman: los postes de la puerta 487 están a (+54, -27) px (una "/") y en el replay va sobre un muro a lo largo de x, que se dibujaba "\". La 673 es vertical en el juego y caía en un muro horizontal (estaba en PENDIENTES).
- [x] `packages/viewer/src/orientation.js`: `toGameOrientation(data)` gira el replay (`(x, y) -> (y, n - x)`, terreno y elevación por tile) antes de dárselo al motor. El render no cambia; el análisis y el contexto para IA siguen con las coordenadas del juego.
- [x] Los anexos del centro urbano vienen en tiles del juego: `(dx, dy)` del juego es `(dy, -dx)` en el motor. Antes se compensaba con `(-dx, +dy)`, que da lo mismo para los anexos que existen (pares simétricos).
- [x] Los cuadros de muro (`x`, `y`, horizontal, vertical) se eligen por la pantalla: siguen bien.
- [ ] Rehacer las capturas (`public/images/visor/*`, `og.jpg`, `docs/screenshots/*`, vista previa de GitHub): muestran la orientación vieja.
- [ ] Mirarlo en el navegador con una partida conocida y compararlo con el minimapa del juego.

## Aldeanos quietos en el TC
Reporte: "no actualiza a los aldeanos, figuran como 10 en el TC quietos desde que arrancó la partida". **Cierto.**
- En `fixtures/long.json`, el jugador 3 tenía a los 5 min 9 de 13 aldeanos sin moverse nunca. El motor solo hacía salir a los entrenados si el punto de reunión era un recurso del mapa; casi siempre es una oveja (unidad del jugador) o el suelo.
- [x] Al salir del edificio, la unidad va al punto de reunión vigente en ese momento: recurso → recolecta; animal → caza o pastorea; edificio propio sin terminar → construye; suelo → camina hasta ahí. No si su jugador ya le dio una orden.
- [x] Una orden sobre una oveja propia ahora es pastorear (antes solo caminaba hasta ella y la oveja nunca se comía).
- [x] Resultado: 0 o 1 aldeanos sin moverse por jugador en toda la partida (el que queda salió antes de que hubiera punto de reunión, como en el juego).

## Aldeanos a oro
Reporte: "acabo de pasar a feudal y recién va el segundo a oro cuando ya estaban los 5 cuando apreté el botón". **Sin confirmar**: hace falta el replay. Lo más probable es lo mismo de arriba (aldeanos que quedaban en el TC hasta la siguiente orden) o el vínculo de IDs con unidades entrenadas.
- [ ] Pedir el enlace de la partida y revisar ese momento.

## Chat con cosas que no son chat
Reporte: aparecían "<player_id,5,0> ha avanzado a la Edad Feudal." en el chat. **Cierto.**
- DE guarda sus avisos en el chat, en el idioma de quien grabó, con un marcador del jugador.
- [x] `notices.js`: `isSystemMessage`, `playerChat`. El chat, el contador de la pestaña, el registro de eventos y el contexto para IA ya no los muestran.
- [x] Se usan como **hora exacta de llegada a cada edad** (análisis, motor y contexto para IA). En `long.json` cambian cosas: un jugador hizo clic en Imperial y nunca llegó (antes figuraba que sí), otro llegó a Feudal 53 s después de lo estimado. Sin avisos (versiones viejas o partidas cortas) se sigue estimando, marcado con `~`.
- Los taunts ("11: ( Risas )") sí los escribe el jugador: quedan.

## Resumen para IA por jugador
- [x] Selector "Preguntar por" en la pestaña IA: con un jugador elegido, el build order y las órdenes son solo suyos y el texto le pide a la IA que responda sobre ese jugador. La lista de jugadores y la tabla comparativa quedan completas.

## Herramientas: AoE2 Overlay
- [x] Sección grande en la portada y página `/tools` (en el sitemap y en la barra), con el video demo recomprimido (`public/videos`, 1,1 MB, se baja recién al verse) y enlaces con UTM (`utm_source=aoe2-replays`, `utm_campaign=home|tools`) para medir el tráfico en el sitio del overlay.
- [ ] El video y el overlay están en español: si se hace una versión en inglés del video, cambiarla para la interfaz en inglés.
