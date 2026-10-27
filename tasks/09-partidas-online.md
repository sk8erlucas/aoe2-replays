# Fase 9: Partidas online (sin subir archivos)

Objetivo: buscar un jugador por nombre, ver sus partidas recientes y reproducir cualquiera **sin que nadie tenga que subir el archivo**. Las partidas online de AoE2: DE son públicas y sus replays se pueden descargar.

## Qué se verificó (27/10/2026)
| Fuente | Endpoint | Devuelve | Auth |
|---|---|---|---|
| Descarga de replay (Microsoft) | `https://aoe.ms/replay/?gameId=<match>&profileId=<perfil>` → redirige a `https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/?gameId=…&profileId=…` | ZIP con `AgeIIDE_Replay_<match>.aoe2record` (probado: partida de 48 min, 2,2 MB comprimido, nuestro parser la lee) | No |
| API de World's Edge (oficial, no documentada) | `https://aoe-api.worldsedgelink.com/community/leaderboard/GetPersonalStat?title=age2&profile_ids=[id]` | Alias, país, clan, ELO por ranking, victorias, derrotas, racha | No |
| API de World's Edge | `https://aoe-api.worldsedgelink.com/community/leaderboard/getRecentMatchHistory?title=age2&profile_ids=[id]` | Partidas recientes con jugadores, mapa, resultado | No |
| aoe2companion (comunitaria) | `https://data.aoe2companion.com/api/profiles?search=<texto>` | Búsqueda de perfiles por nombre (sirve para autocompletar) | No |
| aoe2companion | `https://data.aoe2companion.com/api/matches?profile_ids=<id>` | Partidas con mapa, ranking, jugadores, civilizaciones, ganadores | No |

Ninguna de estas APIs está documentada como pública ni tiene acuerdo de uso con nosotros: pueden cambiar o cortarse. Hay que tratarlas como frágiles.

## Flujo
1. **Buscar jugador** con autocompletado (nombre → lista de perfiles con país, ELO y cantidad de partidas).
2. **Perfil**: ELO por ranking, victorias/derrotas, partidas recientes (mapa, civilizaciones, duración, resultado).
3. **Ver partida**: botón en cada partida. El servidor descarga el ZIP de Microsoft, extrae el `.aoe2record`, lo pasa por el parser y guarda el JSON.
4. Página `/m/<matchId>` con el visor y el análisis. Como la partida ya es pública, esta página es pública (distinto de los replays subidos a mano, que son privados).

## Tareas
### Investigación (antes de programar)
- [ ] Leer términos de uso de aoe2companion y pedir permiso o acordar atribución y límites; evaluar si conviene usar solo las APIs oficiales
- [ ] Ver si World's Edge tiene búsqueda por nombre (hay endpoints de leaderboard; falta uno de búsqueda libre)
- [ ] Averiguar cuánto tiempo se pueden descargar los replays desde Microsoft (¿días? ¿semanas?) y qué pasa con partidas viejas
- [ ] Confirmar con `docs/LEGAL.md` que mostrar datos de perfiles públicos y reproducir sus partidas está bien (incluye privacidad: nombres, país)

### Servidor
- [ ] Servicio/ruta que descarga el replay por `matchId` + `profileId`: validar que la URL final sea de `api.ageofempires.com`, tamaño máximo, tiempo máximo, ZIP con un solo archivo `.aoe2record` (protección contra zip bombs)
- [ ] Guardar partidas por `matchId` (una sola vez aunque la pidan muchos): tabla `matches` con metadatos y el JSON comprimido, separada de `replays`
- [ ] Caché de búsquedas y perfiles (minutos) para no golpear las APIs; límite de pedidos por IP
- [ ] Cola para descargas y parseo si se vuelve lento (partidas largas)
- [ ] Manejar errores claros: replay no disponible, versión no soportada, API caída

### Web
- [ ] Buscador con autocompletado en la barra superior (debounce, teclado, sin resultados)
- [ ] Página de perfil `/p/<profileId>` con ELO, récord y partidas recientes
- [ ] Página de partida `/m/<matchId>` con visor y análisis; botón "Ver partida" desde el perfil
- [ ] Enlaces compartibles a un momento: `/m/<matchId>?t=12:34`
- [ ] Datos extra que vienen de la API en el análisis: ganador, ELO de cada jugador, ranking de la partida
- [ ] Atribución visible a las fuentes de datos

### Más adelante
- [ ] Seguir jugadores y ver sus partidas nuevas
- [ ] Estadísticas agregadas por jugador (civilizaciones más usadas, build orders, APM promedio)
- [ ] Partidas destacadas (jugadores de ELO alto) en la portada
