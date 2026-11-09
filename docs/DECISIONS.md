# Decisiones y preguntas abiertas

## Decididas
- Nombre: **AoE2 Replays**.
- Objetivo: herramienta de análisis (visor + estadísticas + build orders).
- Procesamiento: parseo en servidor, visor en el navegador.
- Servidores: más de uno, separados por responsabilidad (ver `ARCHITECTURE.md`): web Next.js y parser en Python.
- Licencia: MIT.
- Stack web: Next.js + Postgres + Prisma.
- Replays subidos con cuenta (cuando exista "Mis replays"): no expiran mientras exista la cuenta, con un tope de 200 por cuenta. Se borran con la cuenta. Decidido el 09/11/2026.
- Partidas online: se borran a los 90 días de la última vez que alguien las miró. Si se vuelve a abrir una y Microsoft todavía la tiene, se descarga de nuevo. Decidido el 09/11/2026.
- Correo transaccional (recuperar la contraseña, verificar el email): **Resend**.
- Cuentas con email y contraseña propias (scrypt y sesiones en Postgres), sin Auth.js: decidido el 09/11/2026 para que funcionen sin claves de terceros. Ver [`tasks/13-cuentas.md`](../tasks/13-cuentas.md).
- Replays privados; se comparten solo si el enlace se hace público.
- Se guarda solo el JSON del parser comprimido con gzip (~230 KB para el replay de ejemplo, frente a 2,7 MB sin comprimir), nunca el `.aoe2record`. Metadatos (mapa, jugadores, duración) en columnas para listar.
- Expiración provisional: 30 días (`REPLAY_TTL_DAYS`). Tamaño máximo provisional: 30 MB.
- Límite provisional: 20 subidas por IP por hora; la IP se guarda solo como HMAC.
- La cuenta no es obligatoria para subir.
- Sin planes de pago; se financia con publicidad (probable).
- Primero un prototipo con gráficos simples; mejora continua.
- Código abierto; cada pull request se evalúa antes de aceptarse.
- Monorepo (un solo repo con `apps/`, `services/`, `packages/`), con un contenedor por servicio. Se despliegan por separado aunque compartan repo; el contrato JSON y sus tipos quedan versionados juntos.
- Repo privado mientras se desarrolla.
- Diseño de la web: **pergamino ilustrado** (papel, tinta, Cinzel + Montserrat, botones de bronce). Guía en `docs/DESIGN.md`. El mapa del visor no sigue esa estética: apunta a parecerse al juego.
- Experiencia del visor: simular la partida lo más parecido posible al juego, por etapas (`tasks/08-experiencia-de-juego.md`). Se usan los gráficos y el arte del juego bajo las Game Content Usage Rules de Microsoft (ver `docs/LEGAL.md`). Los sprites se extraen una vez del juego y los sirve la web (opción B1).
- Contexto para IA: el visor ofrece la partida como texto para pegar en una IA (resumen ~15 mil tokens o completo), en lugar del JSON crudo, que es casi todo mapa y objetos de Gaia.
- Partidas online (hecho): buscar jugadores con aoe2companion y reproducir sus partidas descargando el replay de Microsoft (`tasks/09-partidas-online.md`). Se guardan una vez por número de partida y son públicas; los replays subidos a mano siguen privados.
- Portada con hero (arte oficial del juego), cómo funciona, subida, funciones y preguntas frecuentes.
- Repo público pronto: README público, `CONTRIBUTING.md`, sin replays ni datos personales en los archivos.

## Abiertas
- ¿Cuántos días duran los replays de usuarios anónimos antes de borrarse? (hoy 30, configurable)
- ¿Tamaño máximo de archivo? (el de ejemplo pesa ~2 MB; hay que medir partidas largas)
- ¿Idiomas de la web: español, inglés o ambos?
- ¿Dónde se aloja el repo (GitHub personal o una organización)?
- ¿Dominio y hosting definitivos?
- ¿Red publicitaria? Afecta a lo legal (ver `LEGAL.md`) y a la experiencia.
