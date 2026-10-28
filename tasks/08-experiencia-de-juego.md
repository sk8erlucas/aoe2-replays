# Fase 8: Experiencia de juego

Objetivo: que ver un replay se sienta **lo más parecido posible a mirar la partida en el juego**: cada edificio y unidad con su aspecto real (por civilización y edad), animaciones, recursos que se agotan, interfaz de espectador. Se hace por etapas; cada una tiene que dejar el visor mejor que antes.

## Límite que no cambia
El replay guarda **solo las órdenes de los jugadores**. El juego vuelve a simular todo con su motor, que es cerrado. Todo lo que mostramos más allá de las órdenes (por dónde camina una unidad, cuánto recolectó, quién ganó un combate) es una **estimación**. La meta es que la estimación se vea y se sienta como el juego, y marcar en la interfaz lo que es aproximado.

## Gráficos: dos caminos
| Camino | Qué es | Distribución | Estado legal |
|---|---|---|---|
| **A. Sprites propios** | Arte propio que imita el estilo del juego (isométrico, misma escala y proporciones, paleta parecida) | Va en el repo y en la web, MIT/CC | Seguro |
| **B. Gráficos del juego del usuario** | El navegador lee los archivos de gráficos de **la instalación del propio usuario** (por ejemplo `resources/_common/drs/graphics/*.sld`) y los decodifica localmente. Nosotros no subimos ni servimos esos archivos | No se distribuyen: cada usuario usa su copia | A confirmar con las [reglas de contenido de Microsoft](../docs/LEGAL.md) |

**Decisión (27/10/2026):** se usan **los gráficos del juego** bajo las Game Content Usage Rules (ver `docs/LEGAL.md`). Falta elegir cómo llegan al navegador:
- **B1. Extraídos y servidos por nosotros**: un script convierte los sprites del juego (SLD) a atlas PNG/WebP una vez y la web los sirve. Funciona para todos, pesa en el servidor (hay que elegir solo lo necesario).
- **B2. Desde la instalación del usuario**: el navegador los lee de la carpeta del juego. No pesa en el servidor, pero solo funciona en Chrome/Edge y para quien tenga el juego.

Elegido: **B1** con un subconjunto (edificios y unidades principales, por arquitectura), y las formas propias actuales como respaldo mientras cargan.

## Etapas

### Etapa 1: base (hecha)
- [x] Vista isométrica 2:1 con relieve
- [x] Cámara cercana con seguimiento, minimapa
- [x] Formas simples: edificios con techo, granjas planas, unidades, árboles, oro, piedra, bayas
- [x] Recursos que se agotan: árboles talados (dejan tocón), minas y bayas agotadas, según las órdenes de recolección

### Etapa 3: gráficos del juego (camino B)
- [x] Resolver lo legal (decidido: Game Content Usage Rules)
- [x] Elegir B1 (servidos) o B2 (instalación del usuario): **B1**
- [x] Extractor (`tools/sprites`, Python): leer los `.sld` de `resources/_common/drs/graphics` (la instalación de desarrollo tiene 7.797 archivos, 8,5 GB), decodificar sus capas (color DXT1, sombra, máscara de color de jugador) y exportar cuadros
- [x] Subconjunto inicial: 19 edificios por civilización y edad (incluido el centro urbano por partes), aldeanos, explorador y unidades comunes (quietos y caminando), árboles, minas, arbustos, reliquias y animales
- [x] Animaciones de trabajo de los aldeanos: talar, minar oro y piedra, recolectar bayas y construir (y caminar con la herramienta), según la actividad que estima el motor
- [ ] Animaciones de granjero (las granjas no se siguen todavía), cazador (la caza no se simula) y de ataque
- [x] Generar atlas WebP + JSON (cuadros, anclas, 8 direcciones) en `apps/web/public/sprites/`, registrados en `CREDITS.md`
- [x] Teñir con el color del jugador usando la máscara (en el navegador, por color)
- [x] Cargar los atlas en `render.js` (`SpriteSet`, carga por página) con las formas actuales como respaldo
- [ ] Muros con su orientación, puertas, edificios destruidos y escombros
- [x] Todos los edificios construibles del juego (puertas, trampas de peces, edificios únicos); los gráficos contenedores incluyen su propio gráfico (arreglaba la herrería de varias civilizaciones)
- [ ] Granjas: usan otro formato de gráfico (no SLD); hoy se dibujan planas
- [x] Unidades militares: el motor vincula los edificios construidos durante la partida con los IDs que usan las colas (según dónde se entrena cada unidad, del archivo de datos del juego), así las unidades salen del edificio correcto con su tipo, tiempo de entrenamiento y velocidad reales
- [x] Líneas militares completas, asedio, monjes y barcos en los sprites; las unidades únicas usan el sprite de una unidad común de su clase
- [ ] Sprites propios de las unidades únicas de cada civilización
- [ ] Investigar los formatos SLD/SMX de DE y librerías abiertas que los lean
- [ ] Elegir la carpeta del juego con la File System Access API (Chrome/Edge) y leer solo lo necesario
- [ ] Decodificar en un Web Worker y guardar en caché del navegador (IndexedDB)
- [ ] Mapear id de unidad/edificio → gráfico, por civilización y edad
- [ ] Interruptor "gráficos propios / gráficos de mi juego"

### Etapa 4: simulación más fiel
- [ ] Actualizar el home con imagenes del nuevo motor grafico
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
- [ ] **Música de fondo** como en el juego, mientras se mira una partida:
  - Pistas de la banda sonora del juego (bajo las Game Content Usage Rules, registradas en `CREDITS.md`) o música libre como alternativa.
  - Que **no arranque sola** (los navegadores bloquean el audio automático y molesta): botón de música en la barra de controles, con volumen y silencio recordados en el navegador.
  - Pistas en archivos comprimidos (Opus/OGG o MP3, ~128 kbps) cargadas solo al activar la música; lista que pasa de una pista a otra.
  - Opcional: pistas según la civilización del jugador seguido o el momento de la partida.
- [ ] Sonidos del juego (efectos: construir, avanzar de edad, chat) con el mismo control de volumen
- [ ] Atajos de teclado parecidos a los del juego para el espectador

## Cómo se integra
`packages/viewer/src/render.js` separa cámara y dibujo. Los métodos `#drawBuilding`, `#drawUnit`, `#drawResource`, `#drawStump` y la capa de terreno se reemplazan por versiones con sprites sin tocar la cámara, el motor ni el análisis.
