# Fase 14: Calidad gráfica (baja, media, alta)

Objetivo: que el visor ande bien en equipos modestos y celulares, con un selector de calidad como el de los juegos. No es urgente: se hace cuando el visor esté estable.

## Niveles
| Nivel | Terreno | Edificios | Unidades | Otros |
|---|---|---|---|---|
| **Alta** (actual) | Texturas del juego con transiciones suaves y agua en movimiento | Por civilización y edad | Animaciones completas | Escombros, sombras, banderas |
| **Media** | Texturas sin transiciones ni agua en movimiento, bloques a menor resolución | **Un juego de sprites compartido para todas las civilizaciones** (por ejemplo, la arquitectura de los francos) teñido con el color de cada jugador | Menos cuadros por animación | Sin escombros |
| **Baja** | **Sin terreno**: colores planos (como antes de las texturas) | Sprites compartidos | Sin animación de trabajo ni ataque (quieto/caminando) | Sin árboles de lejos, minimapa simplificado |

La ventaja de "media" y "baja" no es solo dibujar menos: también **se descarga mucho menos** (un solo juego de edificios en vez de uno por civilización, y sin texturas de terreno en "baja").

## Tareas
- [ ] Selector de calidad en la barra del visor (Alta / Media / Baja / Automática), recordado en el navegador (`localStorage`)
- [ ] **Automática**: elegir según el equipo (memoria del dispositivo, núcleos, ancho de pantalla, `prefers-reduced-motion`) y bajar un nivel si los cuadros por segundo caen por debajo de ~30 durante unos segundos
- [ ] Terreno por nivel en `render.js` (`#paintTerrain` ya tiene el modo sin textura; sumar el modo sin transiciones y sin agua animada)
- [ ] Sprites compartidos: en `tools/sprites`, exportar además un juego de edificios "genérico" (una arquitectura por edad) y en `sprites.js` usarlo cuando la calidad no es alta
- [ ] Animaciones reducidas: cuadros salteados en media; solo quieto/caminando en baja
- [ ] Medir: tiempo por cuadro y memoria en un equipo modesto y en un celular, en las tres calidades, con la partida de 8 jugadores
- [ ] Textos del selector en `messages.ts` (español e inglés)
