# Fase 13: Cuentas, perfil de jugador y favoritos

Objetivo: que quien quiera pueda tener una cuenta para guardar lo suyo (replays, favoritos, su perfil de AoE2), sin que la cuenta sea obligatoria para nada de lo que hoy funciona sin ella: subir, mirar y buscar siguen siendo anónimos.

## Decisiones a tomar (tuyas)
- [ ] **Cómo se inicia sesión.** Propuesta: Auth.js (NextAuth v5) con proveedores OAuth, sin contraseñas propias que custodiar:
  - **Steam** (OpenID): es la cuenta con la que juega casi todo el mundo y sirve además para vincular el perfil de AoE2 (ver abajo).
  - **Discord** y **Google** como alternativas.
  - Sin email/contraseña al principio (menos superficie de ataque y sin recuperación de contraseñas que mantener).
- [ ] ¿Los replays de cuentas registradas expiran? (pregunta abierta en `docs/DECISIONS.md`). Propuesta: no expiran mientras la cuenta exista, con un tope por cuenta (por ejemplo 200).
- [ ] Datos mínimos que se guardan y página de privacidad (qué se guarda, cómo borrar la cuenta).

## Base
- [ ] Auth.js con el adaptador de Prisma: tablas `User`, `Account`, `Session` (migración nueva). Sesiones en base de datos, cookie `httpOnly`, `secure`, `sameSite=lax`.
- [ ] Variables nuevas en `.env.example` y `docs/DEPLOY.md` (`AUTH_SECRET`, claves de cada proveedor); registrar las dependencias en `docs/LEGAL.md`.
- [ ] Botón "Entrar" en la barra superior y menú de cuenta (mis replays, favoritos, mi perfil, salir), en los dos idiomas.
- [ ] Revisar la CSP (`next.config.ts`) para los redireccionamientos de los proveedores.
- [ ] Borrar la cuenta: elimina sus datos y sus replays privados; los públicos se pueden conservar anónimos o borrar (elige el usuario).

## Vincular mi perfil de AoE2
- [ ] **Con Steam**: el inicio de sesión da el SteamID; aoe2companion permite buscar el `profileId` por SteamID, así que el vínculo es verificado (no hace falta confiar en lo que escriba el usuario).
- [ ] Sin Steam (Xbox / Microsoft Store): vínculo **sin verificar** eligiendo el perfil en el buscador, marcado como tal. Más adelante, verificación con algo que solo el dueño puede hacer (por ejemplo, poner un código en el nombre de una partida privada).
- [ ] Un perfil de AoE2 se puede vincular verificado a una sola cuenta.
- [ ] Con el perfil vinculado:
  - "Mis partidas" en el menú, que lleva a `/p/<profileId>` con accesos rápidos.
  - Avisos opcionales cuando termina una partida nueva (más adelante; necesita sondear aoe2companion con cuidado de los límites).
  - En `/p/<id>`, insignia "verificado" si el perfil pertenece a una cuenta.

## Favoritos y listas
- [ ] **Jugadores favoritos**: estrella en `/p/<id>`; la portada muestra sus últimas partidas (con caché, respetando los límites de aoe2companion).
- [ ] **Partidas favoritas**: estrella en `/m/<id>` y `/r/<id>` (solo si quien la marca puede verla).
- [ ] **Momentos guardados**: guardar un `?t=` con una nota corta ("la pelea en el centro"), para volver o compartir.
- [ ] Página "Favoritos" con pestañas (jugadores, partidas, momentos).
- [ ] Sin cuenta: favoritos en el navegador (`localStorage`), como hoy "Tus replays en este navegador"; al iniciar sesión, ofrecer pasarlos a la cuenta.

## Mis replays
- [ ] Los replays subidos con sesión iniciada quedan asociados a la cuenta: "Mis replays" con todos, sin depender del navegador ni del enlace de gestión.
- [ ] Reclamar replays subidos antes sin cuenta (con su enlace de gestión `#k=`).
- [ ] Gestión desde la cuenta: hacer público/privado, borrar, renombrar.

## Seguridad y privacidad
- [ ] Protección CSRF en las rutas que cambian datos (Auth.js la trae para sus rutas; las propias, con verificación de origen).
- [ ] Límites por cuenta además de por IP (subidas, favoritos).
- [ ] No exponer el email ni el SteamID en páginas públicas.
- [ ] Repetir la revisión de seguridad de la fase 11 para todo lo nuevo.
- [ ] Tests de la API: permisos (un usuario no puede ver ni tocar lo de otro), borrado de cuenta.

## Más adelante
- Comentarios en momentos de una partida, listas compartidas ("mejores partidas de X"), seguir a otros usuarios. Necesitan moderación: decidir antes de hacerlo.
