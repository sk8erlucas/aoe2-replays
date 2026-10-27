# Pendientes

Separados entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos.

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| Repo en GitHub | Crear el repo privado y hacer push ([DEPLOY](../docs/DEPLOY.md) paso 1) | Deploy, CI |
| Deploy en Dokploy | Crear la base PostgreSQL y el servicio Compose, cargar las variables ([DEPLOY](../docs/DEPLOY.md)) | Probar en el servidor |
| CAPTCHA | Crear claves de Cloudflare Turnstile (sitio + secreto) | Protección de subidas anónimas |
| Logo e ilustraciones | Decidir si se encargan o se hacen propios (estilo grabado, ver [DESIGN](../docs/DESIGN.md)) | Portada final |
| Nombre del proyecto | Las reglas de Microsoft piden no usar el nombre del juego en el título; evaluar un nombre propio ([LEGAL](../docs/LEGAL.md)) | Lanzamiento público |
| Publicidad | Confirmar si las reglas de Microsoft permiten anuncios en un sitio propio | Activar anuncios |
| Repo público | Hacerlo público cuando quieras: los archivos actuales no tienen replays ni datos personales; el historial de git sí tiene un test viejo con el nombre de un jugador de una partida pública | Comunidad |
| Replays de prueba | Pasar 2-3 replays: partida completa, 1v1, versión 66/67 | Probar el visor de verdad y los parches |
| Docker local | El build de imágenes falla por certificados SSL en esta máquina (antivirus o proxy que intercepta HTTPS). Postgres local sí funciona | Probar las imágenes antes del deploy |
| Legal | Leer reglas de contenido de fans de Microsoft ([LEGAL](../docs/LEGAL.md)) | Publicidad, lanzamiento |
| Nombre y dominio | Verificar disponibilidad y comprar | Despliegue público |
| Hosting | Servidor para Dokploy | Despliegue |
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
- [ ] Sprites del juego (B1: extractor + atlas) ([08](./08-experiencia-de-juego.md))
- [x] Pestaña "IA" en el visor: resumen y detalle completo en texto para pegar en una IA, y descarga del JSON
- [x] Búsqueda de jugadores, perfiles y partidas online `/m/<matchId>` ([09](./09-partidas-online.md))
- [x] Portada con hero, contenido y capturas; README público y CONTRIBUTING
- [ ] Plantillas de issue y pull request, código de conducta ([06](./06-comunidad.md))
- [ ] Exportar a video con `MediaRecorder` (prueba de concepto)
