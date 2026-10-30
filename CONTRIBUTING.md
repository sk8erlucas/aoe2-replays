# Cómo contribuir

¡Gracias por sumarte! Este es un proyecto de fans y cada pull request se revisa a mano antes de aceptarse.

## Antes de empezar
- Para cambios grandes, abrí primero un issue contando qué querés hacer, así lo charlamos antes de que inviertas tiempo.
- La hoja de ruta está en [`tasks/`](tasks). Lo que dice "Automático" en [`tasks/PENDIENTES.md`](tasks/PENDIENTES.md) se puede tomar sin consultar.
- Leé [`AGENTS.md`](AGENTS.md): resume la estructura, los comandos y las reglas del proyecto (vale tanto para personas como para agentes de código).

## Al armar el pull request
1. Una rama por cambio, con un título que diga qué cambia.
2. Que pasen los tests, el lint, el typecheck y el build:
   ```sh
   npm test
   npm run lint -w apps/web && npm run typecheck -w apps/web && npm run build -w apps/web
   cd services/parser && .venv/Scripts/python -m pytest
   .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .
   ```
3. Si cambiás el formato JSON del parser, actualizá `services/parser/README.md`, `packages/shared/src/index.d.ts` y los tests.
4. Si cambiás la base de datos, incluí la migración de Prisma.
5. Si cambiás algo visible, sumá una captura al pull request.

## Reglas que no se negocian
- **Nada de replays en el repo**: tienen nombres y perfiles de jugadores. Usá la carpeta `fixtures/`, que está fuera de git.
- **Privacidad**: los replays subidos son privados por defecto; no agregues nada que los exponga.
- **Texto del replay como texto**: nombres y chat nunca van como HTML.
- **Assets**: el arte del juego solo se usa como indica [`docs/LEGAL.md`](docs/LEGAL.md), con su crédito en `apps/web/public/images/CREDITS.md`. Arte propio: indicá la licencia.
- **Honestidad del visor**: todo lo que el motor estime (y no venga del replay) tiene que estar documentado como aproximado.

## Estilo
- Código y comentarios en inglés; documentación y textos de la interfaz en español rioplatense.
- Interfaz según [`docs/DESIGN.md`](docs/DESIGN.md).

## Reportar problemas
- Un replay que no se puede leer: abrí un issue con la versión del juego y, si podés, el número de partida (no adjuntes el archivo en público si tiene datos que no querés compartir).
- Problemas de seguridad: no abras un issue público; escribí a quien mantenga el repo por un canal privado.

Al contribuir aceptás que tu aporte se publique bajo la licencia [MIT](LICENSE) del proyecto.
