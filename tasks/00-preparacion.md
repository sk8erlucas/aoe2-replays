# Fase 0: Preparación

- [x] Inicializar repo git en `aoe2-replays` y agregar `LICENSE` (MIT)
- [x] Repo en GitHub personal (`sk8erlucas/aoe2-replays`), público y de código abierto desde octubre de 2026
- [x] Dominio: por ahora `aoe2replays.sitemaster.com.ar` (`SITE_URL`); un dominio propio queda opcional
- [x] Leer las reglas de contenido de fans de Microsoft y anotar conclusiones en `docs/LEGAL.md`
- [x] Idiomas de la web: español e inglés, según el navegador
- [~] Guardar 3-5 replays de prueba de distintas versiones y duraciones en `fixtures/` (hay 2: una de 51 s y una de 48 min; los `.aoe2record` no se suben al repo porque traen nombres de jugadores)
- [x] Definir estructura del monorepo (`apps/web`, `services/parser`, `packages/shared`)
- [x] Configurar `.gitignore` y `.editorconfig`
- [x] Lint y formateo: `ruff` (lint + formato) en el parser y ESLint en la web, los dos en el CI
