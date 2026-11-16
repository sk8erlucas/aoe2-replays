# 19: Unidades que faltan y edificios destruidos

Reporte del 16/11/2026 con la partida `/m/521529321` (4v4 en Black Forest, 46 min, siguiendo a Dekaryn): "hay unidades que faltan" y "hay edificios que se destruyen y quedan ahí como si nada".

## Diagnóstico
Los sprites estaban bien: las 8 civilizaciones tienen todas sus unidades en el atlas. Las fallas eran del motor (`packages/viewer/src/engine.js`):

- **Colas en varios edificios a la vez.** Con 16 cuarteles elegidos, el motor ponía toda la cola en el primero y las unidades salían de a una, 16 veces más lento. El juego reparte: cada unidad va al edificio cuya cola termina antes.
- **Unidad de castillo encolada en otro edificio.** Los godos encolan el Huskarl (tipo 41, que según los datos del juego solo sale del castillo) en el cuartel. El motor no encontraba un edificio que pudiera entrenarlo y la orden se perdía: los godos entrenaban 116 unidades en vez de 417.
- **El centro urbano terminado cambia de ID.** Los cimientos son otro objeto (tipo 621): al terminarse, el centro urbano tiene un ID nuevo, y las colas de aldeanos sobre ese ID no encontraban edificio. Medido en la partida: los cimientos de casas, cuarteles y demás conservan el ID; los de centro urbano, no.
- **Ataque en movimiento y patrulla** no movían a las unidades: se quedaban donde estaban.
- **Edificios destruidos.** El motor solo sacaba un edificio si su dueño lo borraba o se rendía. El replay no dice cuándo cae un edificio.

## Hecho (16/11/2026)
- [x] Colas repartidas entre los edificios elegidos (con test).
- [x] Unidades de castillo con "gemelas" en otro edificio (misma clase, velocidad y tiempo en el castillo: Huskarl, Tarkan) se entrenan también ahí (con test).
- [x] El centro urbano terminado toma el ID nuevo si ya se lo conocía por sus cimientos (con test).
- [x] Ataque en movimiento y patrulla mandan a las unidades al punto (la patrulla no va y viene) (con test).
- [x] **Edificios arrasados (estimado):** un edificio contra el que mandaron un ataque de verdad (asedio, o al menos 3 soldados; los aldeanos no cuentan) y que su dueño no volvió a usar (entrenar, investigar, punto de reunión, reparar, guarnecer) aunque siguió jugando al menos un minuto más, se toma como destruido 25 s después de la última orden de ataque. Deja escombros (con test).
- [x] **Construido encima:** si aparecen cimientos sobre un edificio en pie, ese edificio ya no estaba (arrasado, granja agotada, cimientos cancelados). Las murallas siguen sus propias reglas (con test).
- En la partida del reporte: los godos pasan de 116 a 417 unidades entrenadas, 47 edificios arrasados y 21 despejados por construir encima.

## Falta
- [ ] **Probar en el navegador** con `/m/521529321?p=397671` y con la del reporte de murallas (`/m/520532792`): que no desaparezcan edificios que siguen en pie (sobre todo murallas y casas atacadas por pocos) y que las tropas de los godos salgan de los cuarteles.
- [ ] Comparar con el juego en algún momento de la partida (cantidad de edificios y unidades por jugador) para ajustar `RAZE_MIN_ATTACKERS` y los 25 s.
- [x] Aldeanos que se van: el motor saca a las unidades entrenadas que nunca reciben una orden propia y quedan sin hacer nada (`#dropUncommanded`). En esta partida le pasa a 4 aldeanos de Dekaryn a los 7:38, cuando se terminan las ovejas. Se deja así a propósito: las cancelaciones de la cola no están en el replay, y una unidad que nadie manda en toda la partida puede ser una cancelada.
- [ ] Muchas unidades militares entrenadas quedan sin ID asignado (Dekaryn: 43 de sus 107). Caminan al punto de reunión y ahí se quedan. Revisar el emparejamiento de IDs (`#planIds`) con colas repartidas.
- [x] Seguir y guardia (`FOLLOW`, `GUARD`) llevan a la unidad hasta donde está el objetivo en ese momento (no lo siguen después). Detener (`STOP`) la frena donde está.
- [x] Mostrar en la interfaz que los edificios destruidos son una estimación: agregado a la pregunta "¿Es exactamente lo que pasó?" de la portada, junto con las muertes en combate.
