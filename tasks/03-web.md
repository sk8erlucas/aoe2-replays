# Fase 3: Web (Next.js)

- [x] Proyecto Next.js con TypeScript en `apps/web`
- [x] Interfaz mínima de prueba: subir replay → parsear → ver (sin guardar)
- [x] Postgres + Prisma: tabla de replays (JSON gzip + metadatos), tokens de gestión hasheados
- [ ] Usuarios (cuando haya cuentas)
- [x] Subida de `.aoe2record` sin cuenta (flujo principal)
- [~] Validación de tamaño y extensión (hecho); firma del archivo, límite por IP (hecho, `UPLOADS_PER_HOUR`); CAPTCHA (falta, necesita claves de Turnstile)
- [x] Token de gestión para replays anónimos (borrar, hacer público), enlace de gestión con `#k=`
- [x] Expiración automática (`REPLAY_TTL_DAYS`, 30 por defecto; se limpian al subir)
- [ ] Cola de parseo y worker (hoy se parsea en el mismo request; alcanza mientras tarde < 1 s)
- [~] Errores con mensaje claro (hecho); estados `pending`/`ready`/`failed` llegan con la cola
- [x] Página del replay `/r/<id>` con el visor
- [x] Privacidad: privado por defecto (404 si no tenés el token); enlace público con id de 128 bits
- [ ] Auth.js: registro y login opcionales
- [~] "Tus replays en este navegador" sin cuenta (hecho); "Mis replays" con cuenta, pendiente
- [ ] Reclamar un replay anónimo al registrarse
- [~] Contenedores y compose para Dokploy con migraciones automáticas (escritos; falta el primer deploy real, ver `docs/DEPLOY.md`)
- [ ] Política de privacidad y borrado
- [ ] Espacios publicitarios y consentimiento de cookies (solo después de resolver `docs/LEGAL.md`)
