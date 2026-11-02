# Fase 4: Análisis

- [x] Resumen de la partida: jugadores, civilizaciones, equipos, mapa, duración (cabecera del visor y lista de jugadores)
- [x] Build order por jugador a partir de BUILD, DE_QUEUE e investigaciones (clic en el tiempo salta a ese momento)
- [x] Acciones por minuto (APM) por jugador, hasta que abandona
- [x] Línea de tiempo de eventos clave (edades: clic exacto + llegada estimada; abandonos)
- [x] Gráficos de actividad en el tiempo (uno por jugador, misma escala)
- [x] Comparar jugadores lado a lado: tabla de APM y edades, y build orders de dos jugadores intercalados en una línea de tiempo ("Comparar con")
- [x] Documentar qué métricas son exactas y cuáles aproximadas (nota en el panel y en `packages/viewer/src/analysis.js`)
- [x] Probar con una partida completa: DE_TRANSFORM (ráfagas sobre árboles, el mismo árbol muchas veces en el mismo milisegundo) y GAME (velocidad, pausa) no son acciones del jugador
- [x] Unidades militares y eco: lo encolado se separa en economía (aldeanos, pesca, comercio, transporte) y ejército, con totales
