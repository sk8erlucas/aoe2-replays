# Fase 2: Prototipo del visor

Objetivo: ver una partida "jugándose" con gráficos simples. Primero con el JSON del replay de ejemplo, sin web.

- [x] Página HTML con canvas que carga un JSON de ejemplo
- [x] Mapa en pixel art (tiles simples de colores)
- [x] Línea de tiempo con play, pausa y velocidad
- [x] Mostrar edificios al ejecutarse los comandos BUILD
- [x] Mover unidades en línea recta hacia el destino de los comandos MOVE
- [x] Mostrar colas de producción, investigaciones y abandonos (en el panel; las unidades entrenadas aparecen en el mapa)
- [x] Panel lateral con eventos y chat
- [x] Colores por jugador y leyenda
- [x] Zoom y desplazamiento del mapa
- [x] Separar el motor de reproducción de la capa gráfica, para poder cambiar los sprites sin tocar la lógica

## Siguientes
- [ ] Probar con una partida completa (la de ejemplo dura 51 s)
- [x] Vista isométrica 2:1 con relieve, objetos con volumen ordenados por profundidad
- [x] Cámara: zoom cercano por defecto, seguimiento automático de la acción o de un jugador, modo libre, minimapa con clic
- [ ] Cámara: suavizar los saltos del modo auto (hoy mantiene el objetivo 4 s)
- [ ] Sprites pixel art propios por tipo de unidad y edificio (reemplazan los `#draw*` de `render.js`; ver `tasks/07-diseno.md`)
- [ ] Marcar recursos agotados y árboles talados (no se sabe con exactitud; evaluar heurística)
- [ ] Puntos de reunión (GATHER_POINT) y muros de piedra
- [ ] Seguir a un jugador / filtrar eventos por jugador
