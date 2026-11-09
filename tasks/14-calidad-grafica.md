# Fase 14: Calidad gráfica (baja, media, alta)

Objetivo: que el visor ande bien en equipos modestos y celulares, con un selector de calidad como el de los juegos.

**Prioridad alta (09/11/2026): en un celular el visor hoy no llega a cargar, es demasiado pesado.** Referencia: `public/sprites` son 133 MB en 2573 archivos. Una partida no baja todo, pero lo que importa en el celular es además la memoria: cada atlas WebP ocupa mucho más una vez decodificado.

## Primero: que cargue en un celular
Antes de los niveles, conviene entender dónde se rompe y sacar lo más pesado.
- [ ] Medir en un celular real o emulado, con la partida de 8 jugadores: megabytes bajados, cantidad de pedidos, memoria y en qué paso falla (descarga del JSON, sprites, terreno o dibujo)
- [ ] Definir un presupuesto y comprobarlo: por ejemplo, menos de 15 MB y menos de 300 MB de memoria en calidad Baja
- [ ] Mostrar el mapa enseguida y bajar los sprites de a poco, con progreso visible (el render ya dibuja formas propias cuando falta un sprite: `#sprite*` devuelve `false`)
- [ ] Bajar atlas solo cuando hagan falta, por civilización y edad, y liberar los que ya no se usan
- [ ] Limitar la resolución del canvas en celulares (`devicePixelRatio` tope 1 o 1,5) y los cuadros por segundo (por ejemplo, 30)
- [ ] Atlas en resolución reducida para Media y Baja (mitad de tamaño = una cuarta parte de la memoria)
- [ ] Si el navegador se queda sin memoria o falla la carga, volver solo a una calidad menor en lugar de quedar en blanco
- [ ] En celulares, entrar por defecto en Baja o Media, con la opción de pasar a Alta
- [ ] Revisar el resto de la web en celular: peso de la portada y de las capturas

## Niveles
| Nivel | Terreno | Edificios | Unidades | Otros |
|---|---|---|---|---|
| **Alta** (actual) | Texturas del juego con transiciones suaves y agua en movimiento | Por civilización y edad | Animaciones completas | Escombros, sombras, banderas |
| **Media** | Texturas sin transiciones ni agua en movimiento, bloques a menor resolución | **Un juego de sprites compartido para todas las civilizaciones** (por ejemplo, la arquitectura de los francos) teñido con el color de cada jugador | Menos cuadros por animación | Sin escombros |
| **Baja** | **Sin terreno**: colores planos (como antes de las texturas) | Sprites compartidos | Sin animación de trabajo ni ataque (quieto/caminando) | Sin árboles de lejos, minimapa simplificado |

La ventaja de "media" y "baja" no es solo dibujar menos: también **se descarga mucho menos** (un solo juego de edificios en vez de uno por civilización, y sin texturas de terreno en "baja").

## Tareas
- [ ] Selector de calidad en la barra del visor (Low / Medium / High / Auto; Baja / Media / Alta / Automática), recordado en el navegador (`localStorage`)
- [ ] **Automática**: elegir según el equipo (memoria del dispositivo, núcleos, ancho de pantalla, `prefers-reduced-motion`) y bajar un nivel si los cuadros por segundo caen por debajo de ~30 durante unos segundos
- [ ] Terreno por nivel en `render.js` (`#paintTerrain` ya tiene el modo sin textura; sumar el modo sin transiciones y sin agua animada)
- [ ] Sprites compartidos: en `tools/sprites`, exportar además un juego de edificios "genérico" (una arquitectura por edad) y en `sprites.js` usarlo cuando la calidad no es alta
- [ ] Animaciones reducidas: cuadros salteados en media; solo quieto/caminando en baja
- [ ] Medir: tiempo por cuadro y memoria en un equipo modesto y en un celular, en las tres calidades, con la partida de 8 jugadores
- [ ] Textos del selector en `messages.ts` (español e inglés)
