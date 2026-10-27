# Decisiones y preguntas abiertas

## Decididas
- Nombre: **AoE2 Replays**.
- Carpeta: `C:\Users\Lucas\Desktop\Proyects\aoe2-replays`.
- Objetivo: herramienta de análisis (visor + estadísticas + build orders).
- Procesamiento: parseo en servidor, visor en el navegador.
- Servidores: más de uno, separados por responsabilidad (ver `ARCHITECTURE.md`): web Next.js y parser en Python.
- Licencia: MIT.
- Stack web: Next.js + Auth.js + Postgres + Prisma.
- Replays privados; se comparten solo si el enlace se hace público.
- La cuenta no es obligatoria para subir.
- Sin planes de pago; se financia con publicidad (probable).
- Primero un prototipo con gráficos simples; mejora continua.
- Código abierto; cada pull request se evalúa antes de aceptarse.
- Monorepo (un solo repo con `apps/`, `services/`, `packages/`), con un contenedor por servicio. Se despliegan por separado aunque compartan repo; el contrato JSON y sus tipos quedan versionados juntos.
- Repo privado mientras se desarrolla.
- Diseño visual: pendiente de definir juntos (`tasks/07-diseno.md`); hasta entonces, estilo provisional.

## Abiertas
- ¿Cuántos días duran los replays de usuarios anónimos antes de borrarse?
- ¿Tamaño máximo de archivo? (el de ejemplo pesa ~2 MB; hay que medir partidas largas)
- ¿Idiomas de la web: español, inglés o ambos?
- ¿Dónde se aloja el repo (GitHub personal o una organización)?
- ¿Dominio y hosting definitivos?
- ¿Red publicitaria? Afecta a lo legal (ver `LEGAL.md`) y a la experiencia.
- ¿Qué pasa con los replays de cuentas registradas: expiran o no?
