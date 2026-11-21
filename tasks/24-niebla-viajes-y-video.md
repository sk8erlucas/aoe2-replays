# 24: Niebla de guerra, viajes a depositar, objetos nuevos y video

Pedidos de Lucas del 21/11/2026 con la partida `/m/522595678?p=397671` (4v4 Black Forest, 78 min): revisarla, avanzar lo que falta de la experiencia de juego ([08](./08-experiencia-de-juego.md)) y terminar el video ([05](./05-video.md)), cuya cámara se veía muy de cerca.

## Hecho (21/11/2026)
- [x] **Arbustos de ananá y gallinas**: el mapa los tenía y `aocref` no los conoce, así que el parser tomaba los arbustos (2650, 125 de comida) como decoración y los aldeanos mandados ahí quedaban "parados". Ahora tienen nombre y categoría (`reference.py`) y el motor corrige los replays guardados antes. Las gallinas salvajes (2084, 2086, 2088) se cazan; las mansas, se pastorean.
- [x] **Lo que trae cada objeto, del juego** (`gaia` en `game-data.json`, 134 objetos): jabalina 300 (el motor le daba 140), alce 380, jabalí de hierro 700, ciervo 140, mina de oro 800... Diez aldeanos sobre una jabalina terminaban enseguida y quedaban parados. Con esto, los "sin tarea" falsos bajan mucho: Dekaryn a los 12 min pasa de 21 a 6, Griffing a los 10 min de 14 a 3.
- [x] **Viajes a depositar**: el aldeano junta una carga (10) y camina al campamento, molino o centro urbano propio más cercano (15 tiles como mucho), y vuelve, mirando hacia donde va. Solo cómo se ve (`stateAt`, `trip`): la estimación de lo juntado ya incluye esas caminatas y la posición de la unidad no cambia.
- [x] **Niebla de guerra** (`packages/viewer/src/fog.js`): selector "Niebla" en la barra del visor. Cada unidad y edificio del equipo ve un círculo del tamaño de su visión del juego (`los` en `game-data.json`). Negro lo nunca visto, oscuro lo ya visto (muestreado cada 30 s), y los enemigos solo donde se ve ahora (sus edificios, donde ya se vio), también en el minimapa, el tooltip y las siluetas detrás de edificios. ~1 ms por cuadro; ~0,1 s la primera vez que se salta al minuto 70. No cuenta mejoras de visión ni bonus de civilización.
- [x] **Video**: encuadre (Cerca, Media por defecto, Lejos, Mapa entero, Como en el visor), formato vertical 9:16 y música del juego. Ver [05](./05-video.md).

## Correcciones (22/11/2026)
- [x] **Mapa explorado**: Lucas notó que el mapa de esta partida empieza explorado, y que explorar no es lo mismo que la niebla (lo explorado queda pintado, con el terreno y los edificios vistos, pero las unidades enemigas solo se ven donde se ve ahora). El replay trae la opción "Revelar mapa" de la sala, pero `mgz` la leía en un lugar equivocado en el save 68.9 (salía todo en cero): el parche la busca cerca del final del header por el tamaño del mapa y la población. Las Black Forest de `fixtures/` son `explored`; Arena y el 1v1 de Arabia, `normal`. Nuevo campo `game.reveal_map` (`normal`, `explored`, `all_visible`, `no_fog`) y la niebla lo usa: explorado empieza todo explorado; todo visible, sin niebla (no se ofrece); sin niebla, lo explorado queda visto. Las partidas guardadas se vuelven a procesar solas (`MATCH_PARSER_REVISION` 2).
- [x] **Video**: a quién sigue la cámara y niebla, elegibles al exportar (ver [05](./05-video.md)); aviso si va a pesar más de 300 MB.

## Falta
- [ ] **Probar en el navegador** (no hubo navegador en la sesión): la niebla (y en el video), los viajes a depositar con sprites, y el video con música, vertical y cada encuadre en Chrome, Safari y un celular.
- [ ] Niebla: mejoras de visión (Guardia del pueblo, etc.), visión aliada solo con Cartografía en partidas sin equipo compartido, lo explorado más fino.
- [ ] Viajes: carretilla y carro de mano (cargan más), cargas visibles en el sprite.
- [ ] Sonidos del juego y gráficos de las granjas: necesitan extraer otros formatos del juego.
