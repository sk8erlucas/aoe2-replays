# 23: Recursos por tipo, cancelaciones y qué se puede hacer exacto

> Movido a `done/` el 25/11/2026: lo que quedaba abierto pasó a [`PENDIENTES.md`](../PENDIENTES.md) y lo que hay que probar a mano, a [`PRUEBAS.md`](../PRUEBAS.md).

Pedidos de Lucas del 20/11/2026 con la partida `/m/522363603?p=5675276` (4v4 Black Forest, 68 min, Fibonaku): el panel de recursos separado por comida, madera, oro y piedra, y "¿se puede hacer todo exacto, como el juego?".

## ¿Se puede hacer exacto?
El replay no guarda lo que pasa en la partida, solo las órdenes de los jugadores (y cada ~17 s un control con algunos números). El juego reproduce un replay **volviendo a simular la partida entera** con su motor: recorridos, combate, recolección, todo con las mismas reglas y la misma semilla al azar, y como es determinista sale idéntica. Para tener eso exacto habría que reescribir el motor del juego completo (miles de reglas, cada unidad y cada bonus de civilización, y seguirlo en cada parche). No es posible en este proyecto; tampoco correr el juego en el servidor (licencia y Windows).

Lo que sí se puede, y es lo que se viene haciendo:
1. **Usar todo lo exacto que trae el replay.** Órdenes y su hora, avisos de edad, chat, y desde esta sesión el **total de recursos de cada jugador** (de los `sync`) y las **cancelaciones** de la cola.
2. **Reglas del juego con sus datos.** Tiempos, velocidades y ahora **costos** de unidades, edificios e investigaciones salen del juego instalado (`tools/sprites/gamedata.py`); el límite de 15 en la cola y no cobrar lo que no se puede pagar.
3. **Anclar lo estimado a lo exacto.** Los recursos por tipo se corrigen cada ~17 s para que sumen el total del juego; así el error no se acumula.
4. **Medir.** El desvío antes de corregir (`drift` en `economy.js`) dice qué tan buena es la estimación: en esta partida la mediana es ~90 por intervalo (~26 en los primeros 10 min); en la de Arena (`522164674`), ~60.

## Hecho (20/11/2026)
- [x] **Recursos por tipo** en la pestaña Recursos: total exacto y comida, madera, oro y piedra estimados (`Replay.stockAt`, `packages/viewer/src/economy.js`). Entre dos `sync`: lo que juntan los aldeanos (tasas estimadas), menos lo que se gasta (costos del juego), compras y ventas en el mercado (precio compartido que sube y baja 3 por cada 100) y tributos (exactos, con 30 % de comisión). Lo que no se puede pagar no se cobra. En cada `sync` se ajusta al total: lo que falta va donde hubo ingresos y gastos, lo que sobra sale de los ingresos.
- [x] **Costos del juego** en `game-data.json` (`cost: [comida, madera, oro, piedra]` de unidades, edificios e investigaciones). El archivo pasa de 57 a 66 KB; lo demás no cambió.
- [x] **Cancelaciones de la cola**: `SPECIAL` con `order_id` 4 sobre un edificio saca una unidad o investigación de la cola (`slot_id`: 0 la que se está haciendo; 1 en adelante, cada grupo de iguales que espera). Comprobado con los totales: Dekaryn encola 4 aldeanos, saca 3, investiga Telar, y el total cierra con la devolución. La unidad no sale, la cola se adelanta, el costo vuelve y queda en el registro ("saca de la cola"). Antes el motor decía que las cancelaciones no estaban en el replay.
- [x] **Cola de 15**: los clics de más (Fibonaku encola lanceros de a 5 decenas de veces estando al tope de población) los rechaza el juego; antes el motor los fabricaba igual. Esta partida pasa de 8028 a 6971 unidades.
- [x] **Análisis**: "unidades entrenadas" cuenta lo que entró de verdad a la cola (sin cancelaciones ni clics de más). Fibonaku: 1605 → 1203 militares.
- [x] Planes terminados movidos a [`done/`](./).

## Falta
- [x] **Producción frenada por población** (20/11/2026): cada edificio da su lugar (casa 5, centro urbano 5, castillo 20, del juego: `pop` en `game-data.json`; los hunos no necesitan casas) hasta el límite de la partida, y cada unidad ocupa el suyo (las ovejas, nada). Una unidad entrenada que saldría sin lugar espera a que haya (una casa terminada, una unidad que se va); si nunca hay, no sale. Si una orden la nombra, estaba afuera a más tardar en esa orden. Antes, al pasar el límite, el motor mataba a la unidad más vieja. En `/m/522363603` dejan de salir entre 15 y 201 unidades por jugador (kevinr: 1059 → 858 militares); Fibonaku casi no cambia (1208 → 1186) porque sus lanceros mueren en las peleas y liberan lugar: con ~10 cuarteles y su economía (~71 000 recursos en lanceros) es posible. No hay con qué compararlo: el replay no trae las estadísticas del final.
- [x] **Clics sin recursos** (22/11/2026): las unidades entrenadas cuya compra no se podía pagar con lo estimado (ajustado al total del juego) no salen, salvo que una orden las nombre. Sin segunda pasada del motor: la economía se calcula al armar la partida (~60 ms) y marca esas unidades. En `/m/522363603` dejan de salir entre 25 y 130 unidades más por jugador; Fibonaku casi no cambia (su economía podía pagarlas).
- [ ] `SPECIAL` con `order_id` 8 (grupos de aldeanos, sin objetivo, sobre todo al principio) y 1 (unidades militares): sin identificar.
- [ ] Ingresos que no se modelan: comercio, reliquias, pesca, bonus de civilización. Se notan como `drift` positivo en el juego tardío.
- [ ] Puntajes del juego: con recursos por tipo y costos ya se puede aproximar la economía y la tecnología.
- [ ] **Probar en el navegador** la pestaña Recursos y el registro con "saca de la cola".
