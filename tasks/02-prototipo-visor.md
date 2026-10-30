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
- [x] Probar con una partida completa (`fixtures/long.json`, 48 min, 8 jugadores)
- [x] Vista isométrica 2:1 con relieve, objetos con volumen ordenados por profundidad
- [x] Cámara: zoom cercano por defecto, seguimiento automático de la acción o de un jugador, modo libre, minimapa con clic
- [x] Cámara: el modo auto va al punto caliente (más órdenes en los últimos 20 s), lo sostiene 3,5 s reales a cualquier velocidad y solo viaja si la acción se movió lejos (a 16×: de 195 a 15 viajes largos por minuto)
- [x] ~~Sprites pixel art propios~~: se usan los sprites del juego ([08](./08-experiencia-de-juego.md)); las formas propias quedan de respaldo
- [x] Marcar recursos agotados y árboles talados (estimación según las órdenes de recolección)
- [x] Muros de piedra y puertas; los puntos de reunión sobre un recurso mandan a recolectar a las unidades nuevas
- [ ] Mostrar la bandera del punto de reunión de cada edificio
- [x] Seguir a un jugador (cámara) e ir a su ciudad con un clic
- [x] Filtrar eventos por jugador (selector en la pestaña Eventos)
