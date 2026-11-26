# Pruebas pendientes

Todo lo que se hizo sin navegador (o sin celular, Safari o Docker) y falta mirar a mano. Juntado el 25/11/2026 desde los planes; cuando algo se pruebe, marcarlo y anotar lo que falle en [`PENDIENTES.md`](./PENDIENTES.md).

Los enlaces van a producción: https://aoe2replays.sitemaster.com.ar. Las partidas guardadas antes de un cambio del parser se vuelven a procesar solas al abrirlas (puede tardar unos segundos la primera vez).

## Partidas de prueba
| Partida | Qué se ve |
|---|---|
| [`/m/522846419?p=5675276`](https://aoe2replays.sitemaster.com.ar/m/522846419?p=5675276) | 4v4 Black Forest, 61 min (Fibonaku): abetos, flechas, peleas, muertes, murallas con postes |
| [`/m/522595678?p=397671`](https://aoe2replays.sitemaster.com.ar/m/522595678?p=397671) | 4v4 Black Forest, 78 min (Dekaryn): mapa explorado, niebla, viajes a depositar, ananá y gallinas |
| [`/m/522363603?p=5675276`](https://aoe2replays.sitemaster.com.ar/m/522363603?p=5675276) | 4v4 Black Forest, 68 min (Fibonaku): recursos por tipo, cancelaciones, población |
| [`/m/522164674?p=397671`](https://aoe2replays.sitemaster.com.ar/m/522164674?p=397671) | 4v4 Arena, 48 min (Dekaryn): puertas del mapa, pestañas, rendiciones |
| [`/m/521966600?p=5675276`](https://aoe2replays.sitemaster.com.ar/m/521966600?p=5675276) | 3v3 Highland, 57 min (Fibonaku): mejoras de unidades, trabuquetes, río y vados |
| [`/m/521529321?p=397671`](https://aoe2replays.sitemaster.com.ar/m/521529321?p=397671) | 4v4 Black Forest, 46 min (Dekaryn): colas repartidas, edificios arrasados |
| [`/m/520532792?t=132`](https://aoe2replays.sitemaster.com.ar/m/520532792?t=132) | 4v4 Black Forest (reporte de Santiago, jugador 5): murallas, jabalíes, granjas |
| [`/m/520299380`](https://aoe2replays.sitemaster.com.ar/m/520299380) | 4v4 Black Forest, 46 min (Santiago, jugador 6): jabalíes atraídos, IDs |

## Visor: motor y mapa
- [ ] **Orientación**: una partida conocida comparada con el minimapa del juego ([15](./done/15-orientacion-chat-y-herramientas.md)).
- [ ] **Edificios que caen por su vida** (nuevo, 26/11/2026): en `522846419` y `522595678`, que los centros urbanos y castillos que caen tengan sentido (en el juego, ¿cayeron?) y que no desaparezcan edificios que siguen en pie. Flechas de más en un castillo o centro urbano con gente adentro (campana).
- [ ] **Muertes** (`522846419`, pelea del min 39-41): los ejércitos se achican durante la pelea y el panel "Ejército" baja a tiempo ([26](./26-vida-y-muertes.md)).
- [ ] **Flechas** (`522846419`): castillos, torres, centros urbanos y arqueros; también con niebla y en el video ([25](./done/25-bosques-flechas-y-soldados.md)).
- [ ] **Bosques de abetos** (`522846419`): sin huecos y las unidades los rodean.
- [ ] **Murallas** (`522846419`, `520532792`): postes en puntas y esquinas; las canceladas no quedan; planificada, en obra y terminada se ven distinto.
- [ ] **Niebla** (`522595678`): selector "Niebla", explorado vs. visto ahora, el que ataca desde afuera se ve. Nuevo (25/11/2026): con Guardia y Patrulla del pueblo las torres y edificios ven más lejos.
- [ ] **Viajes a depositar** (`522595678`): los aldeanos van al campamento y vuelven, con sprites. Nuevo (25/11/2026): con Carretilla y Carro de mano hacen menos viajes y caminan más rápido; los cazadores cargan más.
- [ ] **Recursos** (`522363603`): pestaña Recursos (total y por tipo) y el registro con "saca de la cola".
- [ ] **Puertas y rendiciones** (`522164674`): las puertas de Arena se ven; al final, lo de quien se rinde queda en el mapa.
- [ ] **Mejoras de unidades** (`521966600`, Fibonaku): lanceros → piqueros (29:48) → alabarderos (36:54); trabuquetes del castillo; los ejércitos no se vacían en el punto de reunión; cruzan el río por los vados.
- [ ] **Edificios arrasados** (`521529321`, `520532792`): no desaparecen edificios que siguen en pie (sobre todo murallas y casas atacadas por pocos); las tropas de los godos salen de los cuarteles.
- [ ] **Reportes de Santiago** (`520532792`, `520299380`): que él confirme murallas, jabalíes y granjas.

## Visor: interfaz
- [ ] **Puntaje** (nuevo, 25/11/2026): la pestaña nueva del panel entra bien con cinco pestañas, también en celular y en el video; si tenés una partida con los puntajes del juego anotados, comparar.
- [ ] **Paneles** (`V`): pestañas Aldeanos, Ejército, Recursos y Resumen e investigaciones en curso, en escritorio y celular, y con pantalla completa.
- [ ] **Pantalla completa** (`Mayús+F`), también en iPhone (sin Fullscreen API: modo a toda la ventana).
- [ ] **Música**: botón "♪ Música", que se pause con la reproducción y que suene en Safari/iPhone; sonido de los videos de la portada.
- [ ] **Favoritos y momentos**: la estrella, "Guardar momento", `/favorites` con y sin cuenta, y pasar los del navegador a la cuenta.
- [ ] Ayuda de atajos (`?`) y "Renombrar" un replay.
- [ ] **Campanita y portada**: con una cuenta que siga jugadores, la campanita y "Partidas de los que seguís"; al abrir una partida desde ahí se marca como leída.

## Video
- [ ] En Chrome: música, formato vertical, cada encuadre, a quién sigue la cámara, la niebla y el panel de jugadores ([05](./done/05-video.md)).
- [ ] En Safari, Firefox y un celular (solo se probó Chrome de escritorio).
- [ ] El aviso de más de 300 MB.

## Celulares y calidad gráfica
- [ ] Abrir una partida de 8 jugadores en un celular real y medir: MB bajados, pedidos, memoria y si algo falla ([14](./done/14-calidad-grafica.md)). Presupuesto propuesto en Baja: menos de 15 MB y 300 MB de memoria.
- [ ] Tiempo por cuadro en las tres calidades, en un equipo modesto y en un celular.
- [ ] Zoom con dos dedos y que "Automática" elija bien.

## Web y despliegue
- [ ] Next 16 a mano: subida, `/r/`, `/m/` (visor completo: sprites, cámara, análisis, chat, IA) y cambio de idioma ([12](./done/12-next-16.md)).
- [ ] Imágenes de Docker y un deploy de prueba antes de producción (el build local falla por certificados; lo hace el CI).
- [ ] Reprocesado de partidas guardadas: contra la base local y en producción con `/m/522164674`.
- [ ] Descripción nueva de `/m/<id>` para buscadores y redes (25/11/2026): pegar un enlace en WhatsApp o Discord y ver mapa, modo, duración, ELO y ganadores.
- [ ] Perfil de un jugador (nuevo, 26/11/2026): la sección "Lo que más juega" (civilizaciones y mapas) y que se actualice con "Ver más partidas"; APM en la pestaña Resumen del visor.
- [ ] Perfil oculto: con `HIDDEN_PROFILES=<id>` en un entorno de prueba, `/p/<id>` da error, no sale en la búsqueda ni en el sitemap y no se puede seguir.
- [ ] Sitemap (`/sitemap.xml`): aparecen los jugadores `/p/<id>` de las partidas guardadas.
- [ ] Vista previa de Discord: color de tema y tamaño de imagen ([10](./10-seo-y-redes.md)).
