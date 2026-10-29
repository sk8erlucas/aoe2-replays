# Legal y marcas (a verificar)

Nada de esto fue verificado con un abogado ni con la fuente oficial. Son puntos a revisar antes de lanzar.

- **Nombre**: usar "AoE2" como descriptor, no como marca principal. Aviso de "no afiliado a Microsoft" en README y en la web.
- **Reglas de contenido de fans de Microsoft**: leerlas antes de lanzar. Hay que comprobar si permiten publicidad o cualquier monetización.
- **Publicidad**: la decisión actual es financiar con anuncios. Es el punto legal más delicado; resolverlo antes de activar anuncios.
- **Assets del juego (decidido, 27/10/2026)**: se usan gráficos y arte de Age of Empires II bajo las [Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules) de Microsoft. Condiciones que hay que cumplir:
  - Aviso visible con link a las reglas (está en el pie de la web y en el README).
  - Uso no comercial. **Pendiente**: las reglas hablan de monetización en YouTube/Twitch; para publicidad en un sitio propio no está claro. Resolverlo (o consultar a Microsoft) antes de activar anuncios.
  - Las reglas piden que el nombre del juego no esté en el título del proyecto: **"AoE2 Replays" lo incluye**. Evaluar un nombre propio antes del lanzamiento público.
  - Solo arte oficial de Microsoft/World's Edge. Las obras de artistas de la comunidad (aunque estén en el sitio oficial) tienen su propio autor y no se usan sin su permiso.
  - El arte no queda bajo MIT: cada archivo se registra en `apps/web/public/images/CREDITS.md`.
  - Sprites del juego para el visor (fase 8): misma base legal; definir si se extraen y sirven desde el proyecto o se leen de la instalación del usuario (más liviano para el servidor y para el repo).
  - La estética de la web (pergamino) usa texturas propias y fuentes con licencia libre (Cinzel y Montserrat, SIL OFL), guardadas en `apps/web/src/fonts` junto con su licencia (`OFL-*.txt`), como permite la OFL. La imagen de referencia de diseño es de terceros y no se publica.
- **APIs de partidas online** (`tasks/09-partidas-online.md`): se usan aoe2companion (búsqueda, perfiles, partidas; uso aprobado) y el servicio de descarga de replays de Microsoft (`api.ageofempires.com`). Se atribuyen las fuentes en la web, se cachean las respuestas y se limitan los pedidos por IP. Ninguna está documentada como API estable: pueden cambiar.
- **Datos de perfiles públicos**: nombres, país, ELO y partidas son públicos en el juego, pero siguen siendo datos personales. Mostrar solo lo necesario, permitir pedir que se oculte un perfil y no indexar más de lo que ya es público.
- **Herramienta de sprites** (`tools/sprites`): usa genieutils-py (LGPL-3.0) para leer el archivo de datos del juego. Es una herramienta de desarrollo: no se incluye en la web ni en las imágenes de Docker. Los atlas que genera son arte de Microsoft (Game Content Usage Rules).
- **Licencias de dependencias**: `mgz` (MIT, se copió y parcheó `fast/header.py` conservando su aviso), `aoe2rec` (MIT). Registrar cada dependencia que se agregue.
- **`aocref` / aoc-reference-data**: el repo no publica licencia. Se usa solo como dependencia instalada (la trae `mgz`) para poner nombres al parsear; sus datos no se copian al repo. Los colores del visor son propios. Si hace falta incluir datos de referencia en el repo, pedir permiso o una licencia a SiegeEngineers.
