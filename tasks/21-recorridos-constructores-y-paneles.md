# 21: Recorridos, constructores, guarnición y paneles

Pedidos de Lucas del 18/11/2026 después de ver `/m/521966600` (3v3 Highland): "al mandar un aldeano a construir, luego construye algo cercano" y "las unidades caminan por el agua". Más lo que salió al revisarlo y dos visores del plan [18](./18-visores-de-partida.md).

## Hecho (18/11/2026)
- [x] **Recorridos alrededor del agua y los bosques** (`packages/viewer/src/pathing.js`): A* sobre la grilla de tiles del mapa. Las unidades de tierra no pisan el agua y rodean los bosques cuando la vuelta no es mucho más larga (un tile de bosque cuesta 6; pueden entrar, como el leñador que va a su árbol). Los barcos van solo por agua. Si nada está en el camino, línea recta como antes. A* ponderado (heurística ×2) y caché de recorridos: la partida de 57 min se calcula en ~0,9 s (antes 0,4 s).
  - En `/m/521966600`, tramos de unidades de tierra que cruzan agua: 2496 → 113 (los que quedan rozan la orilla de los vados). Tramos que atraviesan bosque cerrado: 14 218 → 9338 (casi todos leñadores que pasan de un árbol al de al lado).
  - **"Water, Shallow" es agua**: el parser lo clasificaba como `shallows` (vado) por el nombre. Es el río de Highland y no se cruza a pie; ahora es `water` (con test). Los replays guardados antes se leen igual en el motor (`terrainKind`). "Water, Bridge" sí se camina.
  - No se tienen en cuenta: edificios, acantilados y árboles ya talados.
- [x] **Constructores que siguen con lo que hay cerca**: quien termina un edificio y no tiene otra orden va a los cimientos más cercanos de su jugador (10 tiles), como en el juego. Los que terminan un campamento, un molino o un centro urbano primero juntan el recurso de al lado; las granjas se trabajan; las murallas siguen sus propias reglas. En la partida: 548 veces, sobre todo granjas, casas y establos.
- [x] **Guarnición** (salió al revisar los "aldeanos ociosos"): `SPECIAL` con `order_id` 5 sobre un edificio propio es guarnecer, y como el motor lo tomaba como una orden cualquiera, los aldeanos dejaban de trabajar para siempre (14 de los 20 "ociosos" de Dekaryn a los 20 min). Ahora entran al edificio (no se dibujan), y `BACK_TO_WORK` o la campana de nuevo los devuelve a lo que hacían; `UNGARRISON` los saca al punto de reunión. La campana (`TOWN_BELL`) mete a los 15 aldeanos más cercanos (20 tiles). Los otros `SPECIAL` (órdenes 1, 4 y 8, sin identificar) ya no cortan el trabajo.
- [x] **`UNGARRISON` con IDs corridos** (parser): el mismo error que `SPECIAL`, un byte más antes de los IDs. Arreglado igual, y el visor corrige los replays guardados.
- [x] **Visores** ([18](./18-visores-de-partida.md)), botón "Paneles" o tecla `V` (se recuerda en el navegador; apagados por defecto en celulares):
  - Aldeanos de cada jugador por tarea (comida, madera, oro, piedra, construyendo, sin tarea), arriba a la derecha del mapa. `Replay.villagerJobsAt(t)`.
  - Investigaciones en curso del jugador seguido, con barra de progreso, arriba a la izquierda. `Replay.researchesAt(player, t)`; las edades terminan en la llegada exacta cuando el replay trae los avisos.

## Falta
- [ ] **Probar en el navegador**: la partida siguiendo a Fibonaku (`?p=5675276`), que crucen el río por los vados, los paneles en escritorio y celular, y la pantalla completa con los paneles.
- [ ] "Sin tarea" sigue alto en algunos momentos (francos a los 35 min: 38 de 89). Una parte es real (quien termina un castillo se queda quieto, como en el juego) y otra son aldeanos con IDs que se vinculan tarde o mal. Revisar con `#planIds`.
- [ ] Los edificios suben solos desde que se ponen los cimientos, haya o no constructores: los constructores solo los aceleran. Habría que empezar la obra cuando llega el primero.
- [ ] Recorridos: edificios y acantilados como obstáculos; árboles talados que abren paso.
- [ ] Íconos de las investigaciones (arte del juego con `tools/sprites`) en vez del nombre.
- [ ] Los paneles no salen en la exportación a video.
