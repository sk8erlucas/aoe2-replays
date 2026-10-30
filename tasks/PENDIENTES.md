# Pendientes

Separados entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos.

## Repo abierto
El repo es público desde octubre de 2026. Lo que queda de seguridad e infraestructura está en [11-apertura-publica](./11-apertura-publica.md); la migración a Next 16 en [12-next-16](./12-next-16.md).

## Próxima sesión
Quedó a medio revisar o detectado al cerrar la sesión del 29/10/2026:
- [ ] **Capturas desactualizadas**: las de `docs/screenshots`, `public/images/visor`, `og.jpg` y la vista previa de GitHub son de antes de las texturas de terreno. Rehacerlas desde la web con la partida de demo anonimizada (necesita Docker con la base local).
- [ ] **GitHub**: subir la imagen de Settings → Social preview y publicar un primer Release (por ejemplo `v0.1.0`).
- [x] **Muros**: las diagonales estaban invertidas (corregido), los tramos escalonados se ven continuos y las puertas reemplazan los tramos de muro que tapan.
- [ ] **Puertas**: en `long.json` una puerta "n" (673) cae en un muro horizontal en pantalla; revisar si la orientación de las puertas (`ne`, `se`, `e`, `n`) coincide con la del juego.
- [~] **Tipo de unidad mal asignado**: los IDs nuevos se vinculan con la unidad más vieja del jugador. Ya se usa el tipo de orden como pista (construir/recolectar → aldeano, atacar → militar) y barcos pesqueros y carretas no atacan, pero si la primera orden es un `MOVE` no hay pista. Siguiente paso: usar el orden de los IDs (el juego los asigna en orden de creación) para emparejarlos con el orden de entrenamiento.
- [x] **Centro urbano incompleto / piezas negras**: los anexos se ubicaban sobre el eje equivocado (corregido: el anexo `(dx, dy)` va en `(-dx, +dy)`).
- [x] Ovejas con dueño dibujadas como milicia (ahora usan su sprite de animal con el color del jugador).
- [x] Si una página del atlas o una textura falla al bajar, se reintenta (antes el edificio quedaba invisible).
- [x] **`manifest.json` de sprites pesaba 5,5 MB**: partido en núcleo + `civs/<id>.json`; una partida de 8 jugadores baja ~390 KB comprimidos en vez de 1,7 MB.
- [ ] Migración a Next 16 ([12](./12-next-16.md)).

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| CAPTCHA | Crear claves de Cloudflare Turnstile (sitio + secreto) | Protección de subidas anónimas |
| Logo e ilustraciones | Decidir si se encargan o se hacen propios (estilo grabado, ver [DESIGN](../docs/DESIGN.md)) | Portada final |
| Nombre del proyecto | Las reglas de Microsoft piden no usar el nombre del juego en el título; evaluar un nombre propio ([LEGAL](../docs/LEGAL.md)) | Lanzamiento público |
| Publicidad | Confirmar si las reglas de Microsoft permiten anuncios en un sitio propio | Activar anuncios |
| GitHub | Campo "Website" del repo, protección de `main`, secret scanning y reporte privado de vulnerabilidades | Colaboradores |
| Replays de prueba | Pasar 2-3 replays: partida completa, 1v1, versión 66/67 | Probar el visor de verdad y los parches |
| Docker local | El build de imágenes falla por certificados SSL en esta máquina (antivirus o proxy que intercepta HTTPS). Postgres local sí funciona | Probar las imágenes antes del deploy |
| Legal | Leer reglas de contenido de fans de Microsoft ([LEGAL](../docs/LEGAL.md)) | Publicidad, lanzamiento |
| Dominio propio | Opcional: hoy la web está en aoe2replays.sitemaster.com.ar (`SITE_URL`) | SEO |
| Decisiones abiertas | Confirmar expiración (hoy 30 días), tamaño máximo (hoy 30 MB), idiomas ([DECISIONS](../docs/DECISIONS.md)) | Ajustes |

## Automático (se puede avanzar sin vos)
- [x] Persistencia: Postgres + Prisma, guardar el JSON (gzip) con enlace privado y token de gestión
- [x] Página `/r/<id>` para cada replay
- [ ] Cola de parseo y estados `pending` / `ready` / `failed` (cuando haga falta)
- [ ] Tests de la API de la web (subida, permisos, expiración)
- [x] CI de GitHub Actions (tests, lint, build y build de imágenes Docker)
- [ ] Lint y formato para Python (ruff)
- [x] Análisis básico: build order, APM, edades y actividad por jugador
- [x] Vista isométrica del mapa y cámara
- [x] Estilo pergamino aplicado a la web
- [x] Árboles talados y recursos agotados (estimación)
- [x] Sprites del juego (B1: extractor + atlas) ([08](./08-experiencia-de-juego.md))
- [x] Pestaña "IA" en el visor: resumen y detalle completo en texto para pegar en una IA, y descarga del JSON
- [x] Búsqueda de jugadores, perfiles y partidas online `/m/<matchId>` ([09](./09-partidas-online.md))
- [x] Portada con hero, contenido y capturas; README público y CONTRIBUTING
- [x] Plantillas de issue y pull request, código de conducta ([06](./06-comunidad.md))
- [ ] Música de fondo en el visor ([08](./08-experiencia-de-juego.md))
- [x] Interfaz en español e inglés
- [ ] SEO y compartir en redes: vistas previas por partida y jugador (hechos: metadatos generales, imagen, robots y sitemap) ([10](./10-seo-y-redes.md))
- [ ] Exportar a video con `MediaRecorder` (prueba de concepto)
