# Fase 14: Calidad gráfica (baja, media, alta)

Objetivo: que el visor ande bien en equipos modestos y celulares, con un selector de calidad como el de los juegos.

**Prioridad alta (09/11/2026): en un celular el visor hoy no llega a cargar, es demasiado pesado.** Referencia: `public/sprites` son 133 MB en 2573 archivos. Una partida no baja todo, pero lo que importa en el celular es además la memoria: cada atlas WebP ocupa mucho más una vez decodificado.

## Primero: que cargue en un celular
Antes de los niveles, conviene entender dónde se rompe y sacar lo más pesado.

**Lo que se encontró (10/11/2026):** el problema era la memoria, no la descarga. Cada arquitectura tenía una sola página de edificios con todas las edades (por ejemplo `b-west-0`, 4030×1420 más su máscara: ~46 MB decodificada) y todas las civilizaciones usan además páginas grandes compartidas (`b-medi`, `b-slav`, `b-indi`, `b-ande`). Ver los edificios de una sola civilización pedía hasta ~270 MB decodificados; una partida de 8 con varias arquitecturas pasaba de largo la memoria de un celular. Además el canvas del terreno completo podía superar el área máxima de iOS (16 Mpx) en mapas grandes.

- [ ] Medir en un celular real o emulado, con la partida de 8 jugadores: megabytes bajados, cantidad de pedidos, memoria y en qué paso falla (descarga del JSON, sprites, terreno o dibujo)
- [ ] Definir un presupuesto y comprobarlo: por ejemplo, menos de 15 MB y menos de 300 MB de memoria en calidad Baja
- [x] Mostrar el mapa enseguida y bajar los sprites de a poco, con progreso visible: aviso "Cargando gráficos…" sobre el mapa mientras faltan páginas (`SpriteSet.pending`)
- [x] Bajar atlas solo cuando hagan falta y liberar los que ya no se usan: páginas de edificios por arquitectura y edad (`b-west-age2`, `b-west-rubble`), y `SpriteSet.endFrame()` suelta las páginas que no se dibujaron en los últimos cuadros cuando lo decodificado pasa el tope de la calidad (`atlasMB`: 640 / 160 / 64 MB)
- [x] Limitar la resolución del canvas (`devicePixelRatio` tope 2 / 1,5 / 1) y los cuadros por segundo (60 / 30 / 30)
- [x] Atlas a media resolución para Media y Baja (`low/`, lista `pagesLow` del manifiesto)
- [x] Si falla el dibujo (falta de memoria), bajar solo a una calidad menor en lugar de quedar en blanco; los canvas que no se pueden crear (`getContext` nulo) se arman más chicos o se saltean
- [x] En celulares, entrar por defecto en Baja o Media (Automática), con la opción de pasar a Alta
- [x] Zoom con dos dedos en el mapa
- [x] En celular el visor se desplaza: el mapa ocupa el 60% del alto con los controles debajo (antes quedaba una franja de ~150 px), y el zoom cercano inicial es un 30% más lejano en pantallas angostas
- [ ] Partir las páginas `b-*-other` (muros, puertas y edificios únicos juntos, ~23 MB decodificada en Alta) por tipo de edificio: hoy son lo más pesado de un pueblo típico. Necesita otra corrida del extractor (~1,5 h)
- Medido con los atlas nuevos (británicos, pueblo típico de 14 edificios): antes 54 MB decodificados, ahora 42–46 MB en Alta y 11–12 MB en Media/Baja, que además comparten una sola arquitectura para todos los jugadores. Probado en Chrome emulando un celular (390×844, 3×): entra en Media, baja solo `low/`, canvas a 1,5×, sin errores
- [ ] Revisar el resto de la web en celular: peso de la portada y de las capturas

## Niveles
| Nivel | Terreno | Edificios | Unidades | Otros |
|---|---|---|---|---|
| **Alta** (actual) | Texturas del juego con transiciones suaves y agua en movimiento | Por civilización y edad | Animaciones completas | Escombros, sombras, banderas |
| **Media** | Texturas sin transiciones ni agua en movimiento, bloques a menor resolución | **Un juego de sprites compartido para todas las civilizaciones** (por ejemplo, la arquitectura de los francos) teñido con el color de cada jugador | Menos cuadros por animación | Sin escombros |
| **Baja** | **Sin terreno**: colores planos (como antes de las texturas) | Sprites compartidos | Sin animación de trabajo ni ataque (quieto/caminando) | Sin árboles de lejos, minimapa simplificado |

La ventaja de "media" y "baja" no es solo dibujar menos: también **se descarga mucho menos** (un solo juego de edificios en vez de uno por civilización, y sin texturas de terreno en "baja").

## Tareas
Los valores de cada nivel están en `packages/viewer/src/quality.js` (`QUALITY_SETTINGS`).

- [x] Selector de calidad en la barra del visor ("Gráficos": Automática / Alta / Media / Baja), recordado en `localStorage` (`viewer-quality`)
- [x] **Automática**: `pickQuality` elige según memoria del dispositivo, núcleos, pantalla táctil y ancho, `prefers-reduced-motion`; `FpsWatch` baja un nivel si mientras se reproduce los cuadros por segundo quedan debajo del 75% del objetivo durante 5 s
- [x] Terreno por nivel: Media sin transiciones ni agua animada y bloques a menor resolución; Baja sin texturas (colores planos)
- [x] Sprites compartidos: no hizo falta exportar nada aparte, en Media y Baja todos usan los edificios de los británicos (arquitectura de Europa occidental) teñidos por jugador; los edificios únicos que no tiene siguen con los del dueño
- [x] Animaciones reducidas: cuadros salteados en Media y Baja; en Baja sin animaciones de trabajo ni de ataque
- [x] Sin escombros en Media y Baja (un montón de piedras propio)
- [ ] Medir: tiempo por cuadro y memoria en un equipo modesto y en un celular, en las tres calidades, con la partida de 8 jugadores
- [x] Textos del selector en `messages.ts` (español e inglés)
