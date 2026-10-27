# Pendientes

Separados entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos.

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| Repo en GitHub | Crear el repo privado y hacer push ([DEPLOY](../docs/DEPLOY.md) paso 1) | Deploy, CI |
| Deploy en Dokploy | Crear la base PostgreSQL y el servicio Compose, cargar las variables ([DEPLOY](../docs/DEPLOY.md)) | Probar en el servidor |
| CAPTCHA | Crear claves de Cloudflare Turnstile (sitio + secreto) | Protección de subidas anónimas |
| Diseño visual | Definir identidad, paleta, tipografía y estilo del mapa ([07-diseno](./07-diseno.md)) | Rediseño de la web y sprites |
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
- [ ] CI de GitHub Actions (tests de parser, viewer, lint y build de la web), listo para cuando exista el repo
- [ ] Lint y formato para Python (ruff)
- [ ] Análisis básico: build order, APM y línea de tiempo por jugador
- [ ] Vista isométrica del mapa (independiente del diseño final)
- [ ] Exportar a video con `MediaRecorder` (prueba de concepto)
