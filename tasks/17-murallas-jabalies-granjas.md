# 17: Murallas, jabalíes y granjas (reporte de Santiago, 12/11/2026)

Partida del reporte: [520532792](https://aoe2replays.sitemaster.com.ar/m/520532792?t=132), 4v4 en Black Forest; Santiago es el jugador 5 (callmeshock). El replay está en `fixtures/` (fuera de git).

## Murallas
- [x] **"Dos murallas que no hice"**: eran empalizadas que canceló. Al borrar los cimientos el juego manda un DELETE por tramo con IDs que el motor no conocía, así que quedaban dibujadas. Ahora los DELETE de IDs desconocidos que llegan juntos (mismo jugador, menos de 1 s, IDs consecutivos, aunque haya órdenes de otros en el medio) se vinculan con la muralla de ese jugador que tiene esa cantidad de tramos. En el registro: "planifica Empalizada (13 tramos) y la cancela".
- [x] **Planificada, en construcción y construida se ven distinto**: los tramos se levantan de a uno desde la punta más cercana a los aldeanos (caminata + tiempo del juego por tramo, más rápido con más aldeanos: +1/3 cada uno). Si los aldeanos reciben otra orden, lo que falta queda como cimiento (contorno punteado del color del jugador y el edificio casi invisible); un tramo a medias queda a medias. Un aldeano mandado después a un tramo lo empieza al llegar.
- [x] Un clic en un tramo (orden de construir) vincula los IDs de toda la línea (son consecutivos desde el primer extremo).
- [x] Un edificio borrado antes de terminarse no deja escombros.
- Solo las murallas tienen cimientos "planificados": los demás edificios siguen empezando al colocarse (como antes).

## Jabalíes
- [x] **El jabalí atraído no se movía** si el único clic que mostraba su llegada era del TC (flechas o punto de reunión sobre el jabalí). Ahora cualquier clic sobre un animal, de quien sea, lo ubica.
- [x] **Pastores quietos al terminar las ovejas**: en el juego pasan solos al animal ya cazado más cercano (el jabalí del TC). Ahora también, hasta 12 casillas (`HUNTED_REACH`). En la partida: los 7 pastores pasan al jabalí a los 5:46; los dos jabalíes se terminan a los 8:09 y 9:37 (antes, uno a los 18:20 y el otro nunca).
- [x] **Cadáveres eternos**: un animal empezado y abandonado se pudre y desaparece a los 2 min sin que nadie lo coma (`CARCASS_ROT_MS`, estimado). En la partida quedaban 4 jabalíes con 13–64 de comida para siempre.
- [x] Los que comen un mismo animal se reparten alrededor (antes quedaban apilados en el mismo punto).
- [x] Las unidades tapadas por un edificio se dibujan encima, semitransparentes (el juego las muestra como silueta): los cazadores detrás del TC.

## Granjas
- [x] **"Todos en la misma granja"**: con un grupo seleccionado se encolan varias granjas con Shift (por ejemplo, 10 aldeanos y 8 granjas en 3 s). El motor tomaba cada orden como reemplazo de la anterior y todos terminaban en la última. Ahora las órdenes de construir del mismo grupo con menos de 3 s entre sí son una cola: la primera se lleva a todos y cada una de las siguientes, al aldeano siguiente.
- [x] Clics repetidos en el mismo lugar ya no crean granjas duplicadas (en la partida, el jugador 4 tenía 32 en vez de 29).
- [x] Una granja tiene un granjero: si la construyeron varios, o te mandan (orden o punto de reunión) a una ocupada, se busca la libre más cercana (hasta 10 casillas).

## Falta
- [ ] Que Santiago lo pruebe en esa partida.
- [ ] Los demás edificios también podrían tener cimiento "planificado" hasta que llega el primer aldeano (hoy arrancan al colocarse).
- [ ] Las colas con Shift de otras órdenes (mover, recolectar) siguen tomándose como reemplazo.
