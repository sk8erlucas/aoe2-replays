# Pendientes

Lista general de lo que falta, separado entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos. Las pruebas a mano (navegador, celular, Safari, Docker) están en [`PRUEBAS.md`](./PRUEBAS.md).

Planes abiertos, con más detalle: [08 experiencia de juego](./08-experiencia-de-juego.md), [10 SEO y redes](./10-seo-y-redes.md), [11 apertura pública](./11-apertura-publica.md), [13 cuentas](./13-cuentas.md), [18 visores de partida](./18-visores-de-partida.md) y [26 vida y muertes](./26-vida-y-muertes.md). Los terminados, o con poco pendiente, están en [`done/`](./done/): lo que les quedaba abierto pasó a esta lista el 25/11/2026.

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| CAPTCHA | Crear claves de Cloudflare Turnstile (sitio + secreto) | Protección de subidas anónimas |
| Correo (Resend) | Crear la cuenta, verificar el dominio y generar `RESEND_API_KEY` | Recuperar la contraseña y verificar emails ([13](./13-cuentas.md)) |
| Backups | Crear un bucket S3 privado y activar los backups de la base en Dokploy ([DEPLOY](../docs/DEPLOY.md#backups)) | Perder replays subidos si falla el servidor |
| GitHub | Protección de `main`, secret scanning, reporte privado de vulnerabilidades, Dependabot alerts, etiquetas `good first issue`, campo "website", imagen de vista previa (Settings → Social preview) y primer Release (`v0.1.0`) | Colaboradores |
| Ilustraciones | Decidir si se encargan o se hacen propias (estilo grabado, ver [DESIGN](../docs/DESIGN.md)). El logo ya está | Portada final |
| Replays de prueba | Uno de versión 66/67 (si todavía se puede conseguir) y el del reporte de "aldeanos a oro" ([15](./done/15-orientacion-chat-y-herramientas.md#aldeanos-a-oro)) | Probar los parches viejos; ese reporte |
| Docker local | El build de imágenes falla por certificados SSL en esta máquina (antivirus o proxy que intercepta HTTPS). Postgres local sí funciona | Probar las imágenes antes del deploy |
| Legal | Leer reglas de contenido de fans de Microsoft ([LEGAL](../docs/LEGAL.md)) | Lanzamiento |
| Dominio propio | Opcional: hoy la web está en aoe2replays.sitemaster.com.ar (`SITE_URL`) | SEO, Search Console |
| Parser upstream | Decidir si se proponen los parches de 68.9 a `mgz` (con tu cuenta) | |
| Video del overlay | Si se hace una versión en inglés del video de AoE2 Overlay, usarla en la interfaz en inglés | |
| Decisiones abiertas | Hosting definitivo ([DECISIONS](../docs/DECISIONS.md)). Ya decidido: expiración 30 días, tamaño 30 MB, sin publicidad, el nombre queda | |

## Automático (se puede avanzar sin vos)

### Motor del visor (estimaciones)
- [ ] **Vida de los edificios** contra el daño del asedio y de las unidades, en lugar de la regla del asalto (`#estimateRazed`) ([26](./26-vida-y-muertes.md), paso 4). Reemplaza también ajustar `RAZE_MIN_ATTACKERS` y los 25 s ([19](./done/19-unidades-y-edificios-destruidos.md)).
- [ ] **Peleas**: que empiecen cuando en el juego (responder al que pega desde lejos, el asedio dispara solo, unidades que se juntan antes de atacar); monjes, regeneración, flechas extra con guarnición, Química y Balística, altura ([25](./done/25-bosques-flechas-y-soldados.md), [26](./26-vida-y-muertes.md)).
- [ ] **IDs sin vincular**: soldados entrenados sin ID (Dekaryn: 43 de 107) y "sin tarea" alto en algunos momentos (francos a los 35 min: 38 de 89). Revisar `#planIds` ([19](./done/19-unidades-y-edificios-destruidos.md), [21](./done/21-recorridos-constructores-y-paneles.md)).
- [ ] `SPECIAL` con `order_id` 8 (grupos de aldeanos, sin objetivo) y 1 (militares): sin identificar ([23](./done/23-recursos-cancelaciones-y-exactitud.md)).
- [ ] Colas con Shift de otras órdenes (mover, recolectar): hoy se toman como reemplazo ([17](./done/17-murallas-jabalies-granjas.md)).
- [ ] Recorridos: edificios y acantilados como obstáculos; árboles talados que abren paso ([21](./done/21-recorridos-constructores-y-paneles.md)).
- [ ] **Murallas en escalera** (ángulos que no son rectos ni a 45°) y **superpuestas** entre jugadores: reproducir cómo el juego arma las diagonales ([25](./done/25-bosques-flechas-y-soldados.md)).
- [ ] Ingresos que no se modelan: comercio, reliquias, pesca, bonus de civilización (se ven como `drift` positivo) ([23](./done/23-recursos-cancelaciones-y-exactitud.md)).
- [ ] Niebla: visión aliada solo con Cartografía en partidas sin equipo compartido, y lo explorado más fino ([24](./done/24-niebla-viajes-y-video.md)).
- [ ] Cargas visibles en el sprite de los aldeanos.
- [ ] Costo del motor (~2-5 s en partidas largas de 8): si molesta en celulares, armar la partida en un Web Worker ([16](./done/16-animales-ids-y-video.md)).

### Visores y análisis
- [ ] **Puntajes**: compararlos con los del juego en una partida real y ajustar (reliquias, exploración y lo que el juego suma aparte) ([18](./18-visores-de-partida.md)).
- [ ] Configurar los visores: elegir y ordenar, guardarlo, versión compacta en celular ([18](./18-visores-de-partida.md)). APM del momento.
- [ ] Estadísticas agregadas por jugador (civilizaciones, build orders, APM promedio) y partidas destacadas de ELO alto en la portada ([09](./done/09-partidas-online.md), [10](./10-seo-y-redes.md)).

### Gráficos y sonido
- [ ] Partir las páginas `b-*-other` del atlas (muros, puertas y edificios únicos juntos, ~23 MB decodificadas en Alta) por tipo de edificio. Necesita otra corrida del extractor (~1,5 h) ([14](./done/14-calidad-grafica.md)).
- [ ] Granjas con el gráfico del juego (otro formato, no SLD) y sonidos del juego (bancos de Wwise) ([08](./08-experiencia-de-juego.md)).
- [ ] Rehacer las capturas (`public/images/visor`, `og.jpg`, `docs/screenshots`) con la orientación nueva, y dejar el grabador del video demo en `tools/` ([15](./done/15-orientacion-chat-y-herramientas.md), [16](./done/16-animales-ids-y-video.md)).
- [ ] Revisar el peso de la portada y las capturas en celular ([14](./done/14-calidad-grafica.md)).

### Web e infraestructura
- [ ] Mecanismo para que un jugador pida ocultar su perfil ([09](./done/09-partidas-online.md)).
- [ ] Renderizar en el servidor lo esencial de `/p/<id>` y `/m/<id>` ([10](./10-seo-y-redes.md)).
- [ ] Tests de la API contra una base de prueba en el CI: subida, permisos, expiración, cuentas y favoritos ([13](./13-cuentas.md)).
- [ ] Caché y límites compartidos (Postgres o Redis) si hay más de una instancia de la web; cola de parseo y descargas si se vuelve lento ([09](./done/09-partidas-online.md), [11](./11-apertura-publica.md)).
- [ ] Más adelante: TypeScript 7 y Node 24 LTS; si se adopta el React Compiler, prender sus reglas de lint ([12](./done/12-next-16.md)).
- [ ] Sacar el `override` de `effect` cuando Prisma suba su versión (revisado el 25/11/2026: Prisma 7.10.1 sigue con `effect` 3.20.0) ([11](./11-apertura-publica.md)).

### Parser
- [ ] Probar contra la primera versión del juego con un save distinto de 68.9 (hoy se parsea y se marca `untested_version`).

## Hecho el 25/11/2026
- **Limpieza de `tasks/`**: 14 planes con poco pendiente pasaron a `done/`; lo abierto quedó en esta lista y las pruebas en [`PRUEBAS.md`](./PRUEBAS.md).
- **Mejoras del juego en la niebla y los viajes**: `game-data.json` trae ahora los efectos de visión, velocidad y carga, la clase de los edificios y lo que carga cada aldeano (los cazadores, 35). `Replay.attributeAt` los aplica: con Guardia y Patrulla del pueblo las torres y edificios ven más lejos, las edades suben la visión de exploradores y puestos, y con Carretilla y Carro de mano los aldeanos cargan más y caminan más rápido al depositar.
- **Descripción de las partidas** para buscadores y redes: mapa, modo, tamaño, duración, jugadores con ELO y ganadores ([10](./10-seo-y-redes.md)).
- **Velocidad con mejoras**: las unidades caminan con su velocidad del momento, con las mejoras de su jugador y los bonus de su civilización (Carretilla, Carro de mano, Crianza, Escuderos...) y la de su tipo mejorado.
- **Puntajes estimados**: pestaña "Puntaje" en el panel (militar, economía, tecnología y sociedad) ([18](./18-visores-de-partida.md)).
- **Jugadores en el sitemap** ([10](./10-seo-y-redes.md)).
- **Cimientos planificados** para todos los edificios: ya estaba desde el plan 21 (la obra arranca cuando llega el primer constructor).
- **Licencias de las dependencias** revisadas y registradas en [LEGAL](../docs/LEGAL.md) ([11](./11-apertura-publica.md)).

## Historial
Lo hecho en cada sesión está en su plan:
- 22/11/2026: vida y muertes ([26](./26-vida-y-muertes.md)); bosques, flechas y soldados ([25](./done/25-bosques-flechas-y-soldados.md)); mapa explorado y video ([24](./done/24-niebla-viajes-y-video.md)).
- 21/11/2026: niebla, viajes a depositar y video ([24](./done/24-niebla-viajes-y-video.md)).
- 20/11/2026: recursos por tipo, cancelaciones y población ([23](./done/23-recursos-cancelaciones-y-exactitud.md)).
- 19/11/2026: puertas, abandonos y pestañas ([22](./done/22-puertas-abandonos-y-pestanas.md)).
- 18/11/2026: recorridos, constructores y paneles ([21](./done/21-recorridos-constructores-y-paneles.md)); mejoras de unidades y visor ([20](./done/20-aldeanos-parados-y-visor.md)).
- 16/11/2026: unidades que faltan y edificios destruidos ([19](./done/19-unidades-y-edificios-destruidos.md)).
- 13/11/2026: murallas, jabalíes y granjas ([17](./done/17-murallas-jabalies-granjas.md)).
- 12/11/2026: exportar a video ([05](./done/05-video.md)), música, parser cerrado ([01](./done/01-parser.md)), plan de la web cerrado ([03](./done/03-web.md)).
- 11/11/2026: orientación, chat e IA ([15](./done/15-orientacion-chat-y-herramientas.md)); animales e IDs ([16](./done/16-animales-ids-y-video.md)); Next 16 ([12](./done/12-next-16.md)); favoritos ([13](./13-cuentas.md)).
- 10/11/2026: calidad gráfica y celulares ([14](./done/14-calidad-grafica.md)).
- 09/11/2026: cuentas ([13](./13-cuentas.md)).
- Antes: preparación, parser, prototipo, web, análisis, comunidad, diseño y partidas online ([`done/`](./done/)).
