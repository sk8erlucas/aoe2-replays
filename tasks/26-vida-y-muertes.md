# 26: Vida de las unidades y cuándo mueren

Pregunta de Lucas del 22/11/2026: no vemos la vida de las unidades, entonces ¿cómo sabemos cuándo mueren? ¿No conviene calcular la vida para saberlo más exacto?

## Cómo se sabe hoy
El replay no trae vida, daño ni muertes: solo las órdenes de los jugadores (ver [23](./done/23-recursos-cancelaciones-y-exactitud.md#se-puede-hacer-exacto)). El motor estima las muertes **después** de simular la partida (`#estimateFalls`, `#enforcePopulationLimit`):
- Exactas: lo borrado por su dueño (`DELETE`) y los animales que se terminan de comer.
- Estimadas: una unidad mandada a atacar (o a terreno enemigo) que su jugador **nunca vuelve a mover** cae cuando termina la pelea (25 s, `ATTACK_HOLD_MS`), si el jugador siguió jugando al menos un minuto más. Y si un jugador tiene más unidades que población, sobran las que murieron.

Tres problemas:
1. **Llega tarde.** La regla toma la última orden como inicio de una pelea de 25 s, pero el jugador suele dejar de mandar a la unidad bastante antes o después de que muera.
2. **Fantasmas en la simulación.** Como las muertes se calculan al final, durante la simulación siguen vivas unidades que ya cayeron: pelean solas (`#autoFight`), atraen a otras y la niebla las cuenta.
3. **Costo.** Esos fantasmas son la mayor parte de lo que hace lenta la pelea automática: en la partida de 78 min el motor pasó de 4,5 a 6,4 s.

## Lo que el replay sí dice (exacto)
- **Seguía viva**: toda unidad que aparece en una orden (también cambiar la agresividad o la formación) estaba viva en ese momento. Su muerte es posterior a su última aparición.
- **Murió entre dos órdenes**: cuando un jugador vuelve a mandar un ejército (casi siempre con un grupo de teclas, Ctrl+1), la selección trae solo las unidades vivas. Si una unidad estaba en la orden anterior al mismo grupo, falta en esta y no vuelve a aparecer nunca, murió entre las dos. Una conversión no engaña: la unidad convertida sigue apareciendo en las órdenes del otro jugador.
- **La población**: cuando la cola espera lugar, el jugador estaba al tope. Ya se usa.
- **No sirve el resumen del final**: en DE el replay solo guarda el rating y el tiempo, sin unidades muertas ni bajas (revisado en las tres partidas de `fixtures/`).

### Medido (22/11/2026)
Soldados con ID en tres partidas 4v4 Black Forest. "Evidencia": murieron entre dos órdenes al mismo grupo (el 70 % o más de las unidades se repite, a menos de 5 min).

| Partida | Soldados | Con evidencia | Ventana (mediana) | Motor dentro de la ventana | Motor tarde | Motor temprano | Motor no la mata |
|---|---|---|---|---|---|---|---|
| `522846419` (61 min) | 1460 | 544 (37 %) | 9 s | 60 | 405 (87 s tarde en promedio) | 0 | 79 |
| `522595678` (78 min) | 2724 | 829 (30 %) | 14 s | 205 | 457 (68 s) | 122 | 45 |
| `522363603` (68 min) | 3786 | 1070 (28 %) | 16 s | 272 | 704 (100 s) | 3 | 91 |

O sea: para **un tercio de los soldados** el replay dice cuándo murieron con unos 10-15 s de margen, y el motor hoy casi siempre los mata **más de un minuto tarde**, o directamente no los mata.

## ¿Conviene calcular la vida?
Sí, pero **no sola**. Con los datos del juego se puede llevar la vida de cada unidad:
- Vida, ataque, armaduras, bonus por clase, recarga y alcance salen del `.dat` del juego (sumarlos a `game-data.json` en `tools/sprites/gamedata.py`).
- Las mejoras de herrería y las tecnologías únicas se saben exactas: el replay trae cada investigación con su hora. Sus efectos también están en el `.dat` (sumar o multiplicar atributos de una unidad o clase), y los bonus de civilización usan el mismo mecanismo.
- El daño por golpe es como en el juego: por cada tipo de ataque, ataque menos armadura (con mínimo 1), cada recarga.

Lo que lo aleja de lo exacto: las posiciones son estimadas; no se sabe a quién le pega cada unidad (el jugador hace micro y el juego elige objetivos con sus reglas); y quedan afuera la puntería de los arqueros, la altura, las conversiones, la curación, la regeneración y las flechas de los edificios con guarnición. Una simulación de combate sola se desvía rápido, igual que pasaba con los recursos antes de anclarlos a los `sync`.

**La idea es la misma que con los recursos:** usar la vida para decidir **en qué orden y cuándo** caen las unidades, y anclarla a lo exacto. Nadie muere antes de su última aparición en una orden, y el que salió de un grupo muere dentro de esa ventana.

## Plan
1. **Evidencia antes de simular** (barato, la mayor mejora). Una pasada sobre el `timeline` antes de la simulación, para cada ID:
   - cuándo se lo vio vivo por última vez (cualquier orden, también `STANCE` y `FORMATION`);
   - la ventana en que murió, si salió de su grupo.

   `#estimateFalls` pone la muerte dentro de la ventana, cerca del final, y nunca antes de la última aparición. Medir con la tabla de arriba: la columna "dentro de la ventana" tiene que pasar a ser casi todas.
2. **Muertes durante la simulación**: aplicar las muertes con evidencia mientras se simula y no al final. Los muertos dejan de pelear, de verse en la niebla y de costar tiempo. Así se resuelven los fantasmas y buena parte del costo de `#autoFight`.
3. **Vida y daño** para el resto (dos tercios sin evidencia): extraer los datos de combate del juego, aplicar mejoras y bonus desde los efectos del `.dat`, y descontar daño en las peleas que ya arma `#autoFight` (y en las órdenes de atacar). La unidad cae cuando su vida llega a 0, siempre entre su última aparición y el fin de su ventana si la tiene. Con esto, las muertes ya no dependen de "la última orden + 25 s".
4. **Edificios**: la misma vida contra el daño del asedio y de las unidades reemplaza la regla de "asalto de 3 soldados o uno de asedio" (`#estimateRazed`).
5. **Medir siempre**: qué parte de las muertes simuladas cae dentro de su ventana de evidencia. Es el equivalente del `drift` de `economy.js`, y conviene guardarlo como test con las partidas de `fixtures/`.

Lo que se gana a la vista: el ejército que pierde una pelea se achica de a poco, en vez de quedar entero hasta un minuto después. El panel "Ejército" baja cuando tiene que bajar. Y la niebla y las flechas dejan de contar unidades muertas.

## Hecho (22/11/2026, noche)
- [x] **Paso 1, evidencia** (`#deathEvidence`): antes de simular, para cada ID, la última vez que una orden lo nombra (la suya o la de un enemigo sobre él) y, si salió de su grupo, la ventana en que murió. Un grupo cuenta si se vuelve a mandar dentro de 3 min con al menos la mitad de sus unidades. La muerte va a mitad de la ventana, o 15 s antes de que termine si la ventana es larga. Solo para soldados: un aldeano o una unidad que se deja de usar no sale de ningún grupo.
- [x] **Paso 2, durante la simulación**: esas muertes se aplican cuando la unidad recibe su ID, así que ya no pelea, no ve y no ocupa lugar. Ninguna muerte estimada cae antes de la última orden que nombra a la unidad: tampoco las de la regla vieja ni las de población.
- [x] **Paso 3, vida y daño** (`#hit`, `#stats`): en cada paso de pelea (`#autoFight`, y las órdenes de atacar a una unidad), cada unidad pega a su objetivo como en el juego: por golpe, la suma de ataque menos armadura de cada clase que el objetivo tiene (mínimo 1), por la puntería si es a distancia, cada recarga. Castillos, torres y centros urbanos también pegan. Con las mejoras de cada jugador (investigaciones con su hora) y los bonus de su civilización (sus tecnologías ocultas, cuando llega a la edad que esperan), desde `game-data.json` (`tools/sprites/gamedata.py` ahora exporta vida, ataques, armaduras, recarga, alcance, puntería y esos efectos). Cuando la vida llega a 0 la unidad cae, salvo que una orden la nombre después: ahí aguanta con 1.

### Medido
"Dentro" = el motor la mata dentro de su ventana exacta (±15 s). Para medir la vida sola, el motor corre sin la evidencia y se compara contra ella.

| Partida | Solo la regla vieja | Vida, sin evidencia | Con todo |
|---|---|---|---|
| `522846419` (61 min) | 15 % de 495 | 25 % de 492 | 93 % de 544 |
| `522363603` (68 min) | 30 % de 933 | 33 % de 907 | 92 % de 1070 |

Las dos primeras columnas cuentan los soldados con evidencia según la regla de 90 s y el 70 % del grupo. La última, según la regla de la tabla de arriba (5 min y 70 %), que es independiente de la que usa el motor (3 min y 50 %).

- La vida sola mejora poco, porque en la simulación las peleas empiezan más tarde que en el juego (las posiciones son estimadas). Además mata menos de más: las que "nunca mueren" bajan de 13 % a 6 % y de 8 % a 2 %. Duplicar el daño mejora un poco (33-37 %), pero no hay un motivo del juego para hacerlo, así que queda en 1.
- La evidencia es coherente: el 94-98 % de las unidades que marca como muertas también las mata el motor por su cuenta, sin verla.
- El motor quedó **más rápido** que antes de esta sesión, porque los muertos dejan de simularse: 2,0 → 1,9 s, 6,4 → 5,3 s y 4,4 → 3,4 s.

## Falta
- [x] Paso 4 (26/11/2026): vida de los edificios (`#attackBuildings`). Una orden de atacar un edificio con datos de vida dura hasta que cae (antes, 25 s); cada paso de pelea, todo atacante que llegó (asedio, soldados y aldeanos) le pega con el mismo cálculo que a las unidades, contra la armadura del edificio. Un edificio en obra tiene la vida de lo construido. Nadie lo tira antes de la última orden que lo nombra (la del dueño o la de un enemigo sobre él), y queda en `razedBy` quién lo tiró (puntaje militar). La regla del asalto sigue como respaldo, como la evidencia en las unidades: la simulación pega menos que el juego (atacantes sin ID, el asedio que pelea solo). Medido: en `522846419` caen 49 edificios por su vida (7 centros urbanos, 6 castillos) y en total 115 (antes 91); en `522363603`, 19 y 58 (antes 55). El motor tarda lo mismo.
- [x] Flechas extra: cada unidad guarnecida en un castillo, torre o centro urbano suma una flecha a la andanada (daño y dibujo; todas cuentan, una simplificación).
- [ ] Que las peleas empiecen cuando en el juego: responder al que pega desde lejos, que el asedio dispare solo, unidades que se juntan antes de atacar.
- [ ] Monjes (conversión y curación), regeneración, flechas extra de los edificios con guarnición, altura, bonus de equipo.
- [ ] Probar en el navegador: que los ejércitos se achiquen en la pelea y que el panel "Ejército" baje a tiempo.

## Riesgos y límites
- **Nunca va a ser exacto**: el juego vuelve a simular la partida con su motor (ver [23](./done/23-recursos-cancelaciones-y-exactitud.md)). El objetivo es que las muertes caigan en el momento correcto cuando el replay lo dice, y que sean razonables cuando no.
- **Selecciones que se separan**: un jugador que divide un ejército en dos grupos no hace morir a nadie. La regla exige que la unidad no vuelva a aparecer nunca. Las que solo se dejan de usar (quedan quietas en casa) no salen de ningún grupo, así que no dan evidencia.
- **Costo del paso 3**: un daño por recarga para cada unidad en pelea. Con los pasos 1 y 2 hechos antes, hay muchas menos unidades vivas en la simulación, así que debería compensar.
- **Datos del juego**: hay que extraerlos de nuevo con el juego instalado (`tools/sprites`), y registrar en `docs/LEGAL.md` si cambia algo.
