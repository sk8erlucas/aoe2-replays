# Fase 8: Experiencia de juego

Objetivo: que ver un replay se sienta **lo más parecido posible a mirar la partida en el juego**: cada edificio y unidad con su aspecto real (por civilización y edad), animaciones, recursos que se agotan, interfaz de espectador. Se hace por etapas; cada una tiene que dejar el visor mejor que antes.

## Límite que no cambia
El replay guarda **solo las órdenes de los jugadores**. El juego vuelve a simular todo con su motor, que es cerrado. Todo lo que mostramos más allá de las órdenes (por dónde camina una unidad, cuánto recolectó, quién ganó un combate) es una **estimación**. La meta es que la estimación se vea y se sienta como el juego, y marcar en la interfaz lo que es aproximado.

## Gráficos: dos caminos
| Camino | Qué es | Distribución | Estado legal |
|---|---|---|---|
| **A. Sprites propios** | Arte propio que imita el estilo del juego (isométrico, misma escala y proporciones, paleta parecida) | Va en el repo y en la web, MIT/CC | Seguro |
| **B. Gráficos del juego del usuario** | El navegador lee los archivos de gráficos de **la instalación del propio usuario** (por ejemplo `resources/_common/drs/graphics/*.sld`) y los decodifica localmente. Nosotros no subimos ni servimos esos archivos | No se distribuyen: cada usuario usa su copia | A confirmar con las [reglas de contenido de Microsoft](../docs/LEGAL.md) |

**Decisión propuesta:** A por defecto (la web funciona para todos) y B como opción "usar los gráficos de mi juego" para quien tenga AoE2: DE instalado. **No** se suben sprites extraídos del juego al repo ni al servidor mientras no esté resuelto lo legal, porque no son nuestros para licenciarlos y el proyecto piensa financiarse con publicidad.

## Etapas

### Etapa 1: base (hecha)
- [x] Vista isométrica 2:1 con relieve
- [x] Cámara cercana con seguimiento, minimapa
- [x] Formas simples: edificios con techo, granjas planas, unidades, árboles, oro, piedra, bayas
- [x] Recursos que se agotan: árboles talados (dejan tocón), minas y bayas agotadas, según las órdenes de recolección

### Etapa 2: arte propio (camino A)
- [ ] Definir la grilla de sprites: tamaño de tile en píxeles, ángulo, anclaje, sombra
- [ ] Edificios principales por edad: Centro urbano, Casa, Molino, Campamento maderero y minero, Cuartel, Galería de tiro, Establo, Herrería, Mercado, Monasterio, Universidad, Castillo, Muelle, Torres, Murallas, Puertas
- [ ] Conjuntos de arquitectura por región (como el juego: centroeuropeo, occidental, oriental, africano, etc.) y mapeo civilización → conjunto
- [ ] Cimientos y estados de construcción (0%, 50%, 100%) y edificio destruido
- [ ] Unidades: aldeano (hombre y mujer), explorador, milicia, arqueros, caballería, asedio, monje, barcos
- [ ] Animaciones por unidad: quieta, caminando, trabajando (talar, minar, cosechar, construir), atacando, muriendo; 8 direcciones
- [ ] Recursos: variantes de árbol por bioma, minas por cantidad restante, bayas, animales
- [ ] Terreno con textura y transiciones suaves entre tipos (hoy es un color por tile)
- [ ] Agua animada, orillas
- [ ] Cargar sprites como atlas (una imagen por grupo + JSON de cuadros) para que el render sea rápido

### Etapa 3: gráficos del juego del usuario (camino B)
- [ ] Resolver lo legal antes de empezar (ver `docs/LEGAL.md`)
- [ ] Investigar los formatos SLD/SMX de DE y librerías abiertas que los lean
- [ ] Elegir la carpeta del juego con la File System Access API (Chrome/Edge) y leer solo lo necesario
- [ ] Decodificar en un Web Worker y guardar en caché del navegador (IndexedDB)
- [ ] Mapear id de unidad/edificio → gráfico, por civilización y edad
- [ ] Interruptor "gráficos propios / gráficos de mi juego"

### Etapa 4: simulación más fiel
- [ ] Recorridos alrededor de obstáculos (pathfinding en la grilla de tiles) en vez de línea recta
- [ ] Viajes a depositar recursos (aldeano ↔ campamento / centro urbano)
- [ ] Recolección con más fuentes: punto de reunión en recursos (hecho), órdenes a granjas, caza de animales
- [ ] Usar la cola de producción real (cancelaciones, investigaciones que bloquean el centro urbano)
- [ ] Edificios: tiempo de construcción según cantidad de constructores
- [ ] Destrucción de edificios y muerte de unidades cuando hay evidencia (DELETE, ataques a edificios que dejan de recibir órdenes)
- [ ] Revisar `DE_TRANSFORM` y `GAME` con partidas completas

### Etapa 5: interfaz de espectador
- [ ] Barra de jugadores como la del juego: recursos estimados, población, edad, puntaje
- [ ] Panel de producción: qué está entrenando/investigando cada uno
- [ ] Banderas de avance de edad en la línea de tiempo
- [ ] Niebla de guerra opcional por jugador
- [ ] Sonidos ambiente propios (opcional, con licencia libre)
- [ ] Atajos de teclado parecidos a los del juego para el espectador

## Cómo se integra
`packages/viewer/src/render.js` separa cámara y dibujo. Los métodos `#drawBuilding`, `#drawUnit`, `#drawResource`, `#drawStump` y la capa de terreno se reemplazan por versiones con sprites sin tocar la cámara, el motor ni el análisis.
