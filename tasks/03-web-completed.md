# Fase 3: Web (Next.js)

- [x] Proyecto Next.js con TypeScript en `apps/web`
- [x] Interfaz mínima de prueba: subir replay → parsear → ver (sin guardar)
- [x] Postgres + Prisma: tabla de replays (JSON gzip + metadatos), tokens de gestión hasheados
- [x] Usuarios: cuentas propias con email y contraseña ([13-cuentas](./13-cuentas.md))
- [x] Subida de `.aoe2record` sin cuenta (flujo principal)
- [→] Validación de tamaño y extensión (hecho); firma del archivo, límite por IP (hecho, `UPLOADS_PER_HOUR`); CAPTCHA (falta, necesita claves de Turnstile)
- [x] Token de gestión para replays anónimos (borrar, hacer público), enlace de gestión con `#k=`
- [x] Expiración automática (`REPLAY_TTL_DAYS`, 30 por defecto; se limpian al subir)
- [x] Cola de parseo y worker: no hace falta por ahora. Medido el 12/11/2026: una partida de 48 min (4,5 MB) se parsea en 0,33 s en el mismo request
- [x] Errores con mensaje claro; los estados `pending`/`ready`/`failed` solo harían falta con una cola
- [x] Página del replay `/r/<id>` con el visor
- [x] Privacidad: privado por defecto (404 si no tenés el token); enlace público con id de 128 bits
- [x] Registro y login opcionales, sin Auth.js (decidido el 09/11/2026, [13-cuentas](./13-cuentas.md))
- [x] "Tus replays en este navegador" sin cuenta y "Mis replays" con cuenta (10/11/2026)
- [x] Reclamar un replay anónimo: "Guardar en mi cuenta" en `/r/<id>` con el enlace de gestión
- [x] Contenedores y compose para Dokploy con migraciones automáticas, en producción en aoe2replays.sitemaster.com.ar
- [x] Política de privacidad (`/privacy`) y borrado de replays y de la cuenta
- [→] Espacios publicitarios y consentimiento de cookies (solo después de resolver `docs/LEGAL.md`)

Cerrado el 12/11/2026. Lo marcado con `[→]` sigue en [`PENDIENTES.md`](./PENDIENTES.md) (necesita claves o una decisión legal).
