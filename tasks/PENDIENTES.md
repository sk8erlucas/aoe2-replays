# Pendientes

Separados entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos.

## Repo abierto
El repo es público desde octubre de 2026. Lo que queda de seguridad e infraestructura está en [11-apertura-publica](./11-apertura-publica.md); la migración a Next 16 (hecha el 11/11/2026, falta el deploy de prueba) en [12-next-16](./12-next-16.md).

## Cuentas
Hecho el 09/11/2026: registro y login con email y contraseña, vincular el jugador, seguir hasta 20 jugadores, campanita de partidas nuevas, borrar la cuenta y página de privacidad. El 10/11/2026: "Mis replays" (las subidas con sesión quedan en la cuenta y no vencen; se puede guardar uno subido antes). El 11/11/2026: favoritos (partidas y replays con estrella, momentos guardados con nota, página `/favorites`, también sin cuenta en el navegador) y renombrar replays. Falta recuperar la contraseña (con Resend): [13-cuentas](./13-cuentas.md).

## Prioridad: celulares y calidad gráfica
**En un celular el visor no llegaba a cargar** por memoria: una sola civilización pedía hasta ~270 MB de atlas decodificados. Hecho el 10/11/2026: atlas de edificios por arquitectura y edad, copia a media resolución, liberación de páginas sin usar, selector Alta / Media / Baja / Automática (Baja o Media en celulares, baja solo si se traba) y zoom con dos dedos. **Falta probarlo en un celular de verdad** y medir: [14-calidad-grafica](./14-calidad-grafica.md).

## Sesión del 11/11/2026
- Visor: atajos de teclado con ayuda (`?`), ELO y resultado de cada jugador en partidas online.
- Perfil: "Ver más partidas". `/m/<id>` sin `?p=` ya descarga la partida sola.
- Favoritos y momentos guardados, renombrar replays ([13](./13-cuentas.md)).
- Imágenes de vista previa generadas para partidas y jugadores ([10](./10-seo-y-redes.md)).
- Next 16 y ESLint 10 en una rama aparte ([12](./12-next-16.md)).
- **Para probar en el navegador** (no hubo navegador en la sesión; la API se probó contra la base local): la estrella, "Guardar momento", `/favorites` (con y sin cuenta, y pasar los del navegador a la cuenta), la ayuda de atajos y "Renombrar".

## Sesión del 11/11/2026 (tarde): reportes de jugadores
Detalle en [15-orientacion-chat-y-herramientas](./15-orientacion-chat-y-herramientas.md).
- **El mapa se veía girado 90°** (reporte confirmado con la guía de RMS y las puertas del juego). Corregido.
- **Aldeanos quietos en el TC**: los que salían con punto de reunión en una oveja o en el suelo no se movían. Ahora salen hacia el punto de reunión.
- **Chat con avisos del juego** ("ha avanzado a la Edad Feudal"): fuera del chat; ahora dan la hora exacta de llegada a cada edad.
- **Resumen para IA por jugador** y sección **Herramientas** (`/tools` y portada) con AoE2 Overlay.
- **Falta**: rehacer las capturas (`public/images/visor`, `og.jpg`, `docs/screenshots`) porque muestran el mapa con la orientación vieja, probar en el navegador y pedir el replay del reporte de "aldeanos a oro".

## Sesión del 11/11/2026 (noche)
- **Producción caída para ver partidas** desde Next 16 (gzip doble): hotfix en el PR #23.
- Motor: jabalíes atraídos, animales compartidos, IDs por orden de creación, bengalas que ya no cortan el trabajo, campamentos y molino, investigaciones en la cola. Detalle y números en [16](./16-animales-ids-y-video.md).
- Video demo en la portada.

## Sesión del 12/11/2026
- **Música del juego**: en los videos demo y en el visor (botón "♪ Música", no arranca sola). Extraída de la instalación con [`tools/music`](../tools/music) ([08](./08-experiencia-de-juego.md)).
- **Partidas online**: Microsoft guarda los replays ~4 meses; si falta la copia de un jugador se prueba con las de los demás (antes daba "no disponible") ([09](./09-partidas-online.md)).
- **Para probar en el navegador**: el botón de música (también en Safari/iPhone) y el sonido de los videos de la portada.

## Sesión del 13/11/2026: reporte de Santiago
Detalle en [17](./17-murallas-jabalies-granjas.md).
- **Murallas**: las canceladas ya no quedan dibujadas ("dos murallas que no hice"); los tramos se ven planificados, en construcción o terminados, y se levantan de a uno.
- **Jabalíes**: el atraído al TC llega y se lo comen los pastores al terminar las ovejas; los abandonados se pudren; las unidades detrás de un edificio se ven en silueta.
- **Granjas**: las encoladas con Shift se reparten, un granjero por granja, sin duplicadas.
- **Para probar**: la partida del reporte (`/m/520532792`).

## Sesión del 12/11/2026 (noche)
- **Exportar a video** ([05](./05-video.md)): botón "🎬 Video" en el visor; MP4 generado en el navegador con WebCodecs y Mediabunny, con rango, velocidad, 720p/1080p, marca de agua, progreso y cancelar. Probado en Chrome con la web real.
- **Campanita**: el nombre del jugador lleva a su historial (`/p/<id>`); el resto de la fila, a la partida. También en "Partidas de los que seguís" de la portada.
- **Para probar en el navegador**: la campanita con una cuenta que siga jugadores, y el video en Safari, Firefox y un celular.

## Sesión del 12/11/2026 (tarde)
- **Parser cerrado**: test con un 1v1 en el build 188329, nombres para los IDs que `aocref` no tiene, `aoe2rec` descartado.
- **Plan de la web cerrado** ([03-web-completed](./03-web-completed.md)): quedan el CAPTCHA y la publicidad, que ya están en la tabla de abajo. La cola de parseo no hace falta (0,33 s para 48 min).
- **Portada**: sección "Partidas de los que seguís" con las últimas partidas de la campanita, solo con sesión iniciada.
- **Para probar en el navegador**: esa sección con una cuenta que siga jugadores, y que al abrir una partida desde ahí se marque como leída en la campanita.

## Parser (cerrado el 12/11/2026)
Plan en [01-parser-completed](./01-parser-completed.md). Queda abierto:
- [ ] Probar contra la primera versión del juego con un save distinto de 68.9 (hoy se parsea y se marca `untested_version`).
- [ ] Decidir si se proponen los parches de 68.9 a `mgz` upstream (lo haría Lucas con su cuenta).

## Próxima sesión
Quedó a medio revisar o detectado al cerrar la sesión del 29/10/2026:
- [x] **Capturas desactualizadas** (rehechas el 30/10/2026 con el terreno nuevo): las de `docs/screenshots`, `public/images/visor`, `og.jpg` y la vista previa de GitHub son de antes de las texturas de terreno. Rehacerlas desde la web con la partida de demo anonimizada (necesita Docker con la base local).
- [ ] **GitHub**: subir la imagen de Settings → Social preview (nueva, con el terreno) y publicar un primer Release (por ejemplo `v0.1.0`).
- [x] **Muros**: las diagonales estaban invertidas (corregido), los tramos escalonados se ven continuos y las puertas reemplazan los tramos de muro que tapan.
- [x] **Puertas**: la puerta 673 caía en un muro horizontal porque el mapa entero estaba girado 90°. Corregido el 11/11/2026 ([15](./15-orientacion-chat-y-herramientas.md)).
- [x] **Tipo de unidad mal asignado**: los IDs nuevos se vinculan con la unidad entrenada cuando se creó ese ID (el juego los asigna en orden de creación; los IDs conocidos acotan la ventana de tiempo), y el tipo de orden desempata (construir/recolectar → aldeano, atacar → militar). Hecho en `ee72b67`; si aparecen casos raros, revisar con partidas completas.
- [x] **Centro urbano incompleto / piezas negras**: los anexos se ubicaban sobre el eje equivocado (corregido: el anexo `(dx, dy)` va en `(-dx, +dy)`).
- [x] Ovejas con dueño dibujadas como milicia (ahora usan su sprite de animal con el color del jugador).
- [x] Si una página del atlas o una textura falla al bajar, se reintenta (antes el edificio quedaba invisible).
- [x] **`manifest.json` de sprites pesaba 5,5 MB**: partido en núcleo + `civs/<id>.json`; una partida de 8 jugadores baja ~390 KB comprimidos en vez de 1,7 MB.
- [x] Migración a Next 16 y ESLint 10 ([12](./12-next-16.md)), en la rama `next-16`: falta probarla en el navegador y en un deploy de prueba.

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| CAPTCHA | Crear claves de Cloudflare Turnstile (sitio + secreto) | Protección de subidas anónimas |
| Ilustraciones | Decidir si se encargan o se hacen propias (estilo grabado, ver [DESIGN](../docs/DESIGN.md)). El logo ya está | Portada final |
| Nombre del proyecto | Las reglas de Microsoft piden no usar el nombre del juego en el título; evaluar un nombre propio ([LEGAL](../docs/LEGAL.md)) | Lanzamiento público |
| Publicidad | Confirmar si las reglas de Microsoft permiten anuncios en un sitio propio | Activar anuncios |
| GitHub | Protección de `main`, secret scanning, reporte privado de vulnerabilidades, etiquetas `good first issue`, imagen de vista previa y primer Release | Colaboradores |
| Replays de prueba | Hechos la partida completa y el 1v1. Falta uno de versión 66/67 (si todavía se puede conseguir) | Probar los parches viejos |
| Docker local | El build de imágenes falla por certificados SSL en esta máquina (antivirus o proxy que intercepta HTTPS). Postgres local sí funciona | Probar las imágenes antes del deploy |
| Backups | Crear un bucket S3 privado y activar los backups de la base en Dokploy ([DEPLOY](../docs/DEPLOY.md#backups)) | Perder replays subidos si falla el servidor |
| Legal | Leer reglas de contenido de fans de Microsoft ([LEGAL](../docs/LEGAL.md)) | Publicidad, lanzamiento |
| Dominio propio | Opcional: hoy la web está en aoe2replays.sitemaster.com.ar (`SITE_URL`) | SEO |
| Correo (Resend) | Crear la cuenta, verificar el dominio y generar `RESEND_API_KEY` | Recuperar la contraseña y verificar emails |
| Decisiones abiertas | Confirmar expiración de replays anónimos (hoy 30 días), tamaño máximo (hoy 30 MB), idiomas ([DECISIONS](../docs/DECISIONS.md)) | Ajustes |

## Automático (se puede avanzar sin vos)
- [x] Persistencia: Postgres + Prisma, guardar el JSON (gzip) con enlace privado y token de gestión
- [x] Página `/r/<id>` para cada replay
- [ ] Cola de parseo y estados `pending` / `ready` / `failed` (cuando haga falta)
- [~] Tests de la API de la web: validación de ids, tokens y límites (`npm test -w apps/web`, sin base de datos). Falta subida, permisos y expiración contra una base de prueba
- [x] CI de GitHub Actions (tests, lint, build y build de imágenes Docker)
- [x] Lint y formato para Python (ruff, en el CI)
- [x] Análisis básico: build order, APM, edades y actividad por jugador
- [x] Vista isométrica del mapa y cámara
- [x] Estilo pergamino aplicado a la web
- [x] Árboles talados y recursos agotados (estimación)
- [x] Sprites del juego (B1: extractor + atlas) ([08](./08-experiencia-de-juego.md))
- [x] Pestaña "IA" en el visor: resumen y detalle completo en texto para pegar en una IA, y descarga del JSON
- [x] Búsqueda de jugadores, perfiles y partidas online `/m/<matchId>` ([09](./09-partidas-online.md))
- [x] Portada con hero, contenido y capturas; README público y CONTRIBUTING
- [x] Plantillas de issue y pull request, código de conducta ([06](./06-comunidad-completed.md))
- [x] Música de fondo en el visor ([08](./08-experiencia-de-juego.md))
- [x] Interfaz en español e inglés
- [~] SEO y compartir en redes: hechos los metadatos por jugador y partida, el sitemap con partidas, la página 404, el botón "Compartir" (menú nativo, WhatsApp, X, Reddit, Telegram) y las imágenes de vista previa generadas. Falta renderizar en el servidor ([10](./10-seo-y-redes.md))
- [x] Exportar a video ([05](./05-video.md)): WebCodecs + Mediabunny, en el navegador
