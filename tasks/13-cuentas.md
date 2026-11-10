# Fase 13: Cuentas, perfil de jugador y favoritos

Objetivo: que quien quiera pueda tener una cuenta para guardar lo suyo (replays, favoritos, su perfil de AoE2), sin que la cuenta sea obligatoria para nada de lo que hoy funciona sin ella: subir, mirar y buscar siguen siendo anónimos.

## Decisiones a tomar (tuyas)
- [x] **Cómo se inicia sesión.** Decidido el 09/11/2026: **email y contraseña**, sin dependencias nuevas (scrypt de Node, sesiones propias en Postgres). Funciona sin claves de terceros. Steam, Discord o Google se pueden sumar después como otra forma de entrar.
  - Consecuencias aceptadas: sin correo no hay recuperación de contraseña ni verificación del email; el registro revela si un email ya tiene cuenta (limitado por IP); el límite de intentos por email permite bloquear temporalmente el login de otro (15 minutos).
- [x] ¿Los replays de cuentas registradas expiran? No, mientras la cuenta exista, con un tope de 200 por cuenta. Se borran con la cuenta.
- [x] Datos mínimos que se guardan y página de privacidad (`/privacy`).
- [x] Proveedor de correo: **[Resend](https://resend.com)**. Falta crear la cuenta, verificar el dominio y cargar `RESEND_API_KEY`.

## Base
- [x] Tablas `users`, `sessions`, `followed_players` y `notifications` (migración `accounts`). Sesiones en base de datos, cookie `httpOnly`, `secure`, `sameSite=lax`.
- [x] Variables nuevas en `.env.example`, `docker-compose.yml` y `docs/DEPLOY.md`.
- [x] "Entrar" en la barra superior y menú de cuenta, en los dos idiomas.
- [x] Cambiar la contraseña (cierra las demás sesiones).
- [ ] Recuperar la contraseña por correo con Resend: enlace de un solo uso con token guardado como hash y vencimiento corto, misma respuesta exista o no el email, límites por IP y por email, y cerrar las demás sesiones al cambiarla.
- [ ] Verificar el email al registrarse con Resend, y responder igual si el email ya tiene cuenta (hoy el registro lo revela).
- [ ] Actualizar `/privacy` al usar Resend: hoy dice que no enviamos correos. Registrar el servicio en `docs/LEGAL.md`, `.env.example`, `docker-compose.yml` y `docs/DEPLOY.md`.
- [ ] Revisar la CSP (`next.config.ts`) cuando se agregue un proveedor externo. Con email y contraseña no hizo falta.
- [x] Borrar la cuenta: elimina sus datos. Cuando existan replays asociados a la cuenta, decidir qué pasa con ellos.

## Vincular mi perfil de AoE2
- [ ] **Con Steam**: el inicio de sesión da el SteamID; aoe2companion permite buscar el `profileId` por SteamID, así que el vínculo es verificado (no hace falta confiar en lo que escriba el usuario).
- [x] Vínculo **sin verificar** eligiendo el perfil en el buscador o con "Este soy yo" en `/p/<id>`. Solo lo ve su dueño y solo sirve para sus avisos: por eso varias cuentas pueden elegir el mismo jugador. Más adelante, verificación con algo que solo el dueño puede hacer (por ejemplo, poner un código en el nombre de una partida privada).
- [ ] Un perfil de AoE2 se puede vincular verificado a una sola cuenta.
- [x] Con el perfil vinculado:
  - "Mis partidas" en el menú, que lleva a `/p/<profileId>`.
  - Campanita con las partidas terminadas. Se consulta aoe2companion solo mientras el usuario está en la web, como mucho cada 2 minutos por cuenta (hasta dos pedidos, con caché). Trae también las últimas 24 h de un jugador recién vinculado o seguido, y conserva 30 días.
  - En `/p/<id>`, insignia "verificado" si el perfil pertenece a una cuenta.

## Favoritos y listas
- [x] **Jugadores seguidos**: botón en `/p/<id>` y buscador en `/account`, hasta `MAX_FOLLOWS` (20). Sus partidas llegan a la campanita.
- [ ] La portada muestra las últimas partidas de los jugadores seguidos.
- [ ] **Partidas favoritas**: estrella en `/m/<id>` y `/r/<id>` (solo si quien la marca puede verla).
- [ ] **Momentos guardados**: guardar un `?t=` con una nota corta ("la pelea en el centro"), para volver o compartir.
- [ ] Página "Favoritos" con pestañas (jugadores, partidas, momentos).
- [ ] Sin cuenta: favoritos en el navegador (`localStorage`), como hoy "Tus replays en este navegador"; al iniciar sesión, ofrecer pasarlos a la cuenta.

## Mis replays
- [x] Los replays subidos con sesión iniciada quedan asociados a la cuenta (columna `user_id`, migración `account_replays`, se borran con la cuenta) y no vencen, hasta `MAX_ACCOUNT_REPLAYS` (200). "Mis replays" en `/account`. Solo cuenta la sesión si la subida viene del propio sitio (`sameSiteUserId`); desde otro sitio la subida queda anónima.
- [x] Reclamar replays subidos antes sin cuenta: "Guardar en mi cuenta" en `/r/<id>` con el enlace de gestión (`PATCH { saveToAccount: true }`, pide token y sesión).
- [~] Gestión desde la cuenta: el dueño hace público/privado y borra sin token (desde `/r/<id>` y "Mis replays"). Falta renombrar.
- Probado contra la base local el 10/11/2026: permisos entre dos cuentas, pedido desde otro sitio, reclamo y borrado de cuenta. Falta dejarlo en el CI.

## Seguridad y privacidad
- [x] Protección CSRF en las rutas que cambian datos: cookie `sameSite=lax` y verificación de `Origin` (`rejectCrossSite`).
- [x] Límites por cuenta además de por IP: registro, login, cambios de cuenta, seguidos y subidas (`UPLOADS_PER_HOUR` también por cuenta, y `MAX_ACCOUNT_REPLAYS`).
- [x] No exponer el email en páginas públicas.
- [ ] Repetir la revisión de seguridad de la fase 11 para todo lo nuevo.
- [~] Tests: contraseñas, validación, CSRF, redirección tras el login y reglas de avisos en `apps/web/test`. Permisos entre usuarios y borrado de cuenta probados a mano contra una base real el 09/11/2026; falta dejarlos en el CI con una base de prueba.

## Más adelante
- Comentarios en momentos de una partida, listas compartidas ("mejores partidas de X"), seguir a otros usuarios. Necesitan moderación: decidir antes de hacerlo.
