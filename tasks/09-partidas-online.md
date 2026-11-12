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
### Investigación
- [x] aoe2companion: uso aprobado; se atribuye en la web
- [x] Cuánto tiempo guarda Microsoft los replays (medido el 12/11/2026 con el historial de un jugador): **unos 4 meses**. Una partida de 111 días se bajaba; las de 118, 122, 145 días y más viejas daban 404. El mensaje de error ahora lo dice.
- [x] **Copias que faltan**: cada jugador sube su copia y a veces falta (en dos 4v4 recientes, 3 y 4 de las 8 copias daban 404). Si falla la del jugador elegido, `importMatch` prueba las de los demás jugadores de la partida (lista de aoe2companion, hasta 7 más) y guarda de quién la bajó.
- [ ] Mecanismo para que un jugador pida ocultar su perfil

### Servidor
- [x] Ruta que descarga el replay por `matchId` + `profileId` desde `api.ageofempires.com` sin seguir redirecciones, con tamaño y tiempo máximos y límite de tamaño descomprimido (zip bombs)
- [x] Guardar partidas por `matchId` una sola vez (tabla `matches`, separada de `replays`); descargas simultáneas de la misma partida se unifican
- [x] Caché de búsquedas, perfiles y partidas (5 min, en memoria); límites por IP (60 búsquedas/min, 20 descargas/hora)
- [ ] Caché y límites compartidos si hay más de una instancia de la web (hoy son en memoria)
- [ ] Cola para descargas y parseo si se vuelve lento (partidas largas)
- [x] Errores claros: replay no disponible (con el plazo de ~4 meses), versión no soportada, fuente o servicio caído (códigos de la API traducidos en `messages.ts`)

### Web
- [x] Buscador con autocompletado en la barra superior y en la portada (debounce, teclado, sin resultados)
- [x] Página de perfil `/p/<profileId>` con rankings, récord y partidas recientes (resultado, civilizaciones, ELO y su cambio)
- [x] Página de partida `/m/<matchId>` con visor y análisis; botón "Ver partida" desde el perfil
- [x] Paginación de partidas: "Ver más partidas" en el perfil (`/api/players/<id>?page=N`, 20 por página, hasta 50)
- [x] Enlaces compartibles a un momento: `/m/<matchId>?t=<segundos>` (botón "Compartir momento")
- [x] Datos extra de la API (`/api/matches/<id>/info`, aoe2companion): ganador y ELO (con su cambio) junto a cada jugador del visor, y el modo de la partida. Se emparejan por `profile_id` y, si no, por nombre
- [x] Abrir `/m/<id>` sin `?p=` (enlace compartido): se busca un jugador de la partida en aoe2companion y se descarga su copia
- [x] Atribución visible a las fuentes de datos

### Más adelante
- [x] Seguir jugadores y ver sus partidas nuevas (cuentas, [13](./13-cuentas.md))
- [ ] Estadísticas agregadas por jugador (civilizaciones más usadas, build orders, APM promedio)
- [ ] Partidas destacadas (jugadores de ELO alto) en la portada
