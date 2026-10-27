# Legal y marcas (a verificar)

Nada de esto fue verificado con un abogado ni con la fuente oficial. Son puntos a revisar antes de lanzar.

- **Nombre**: usar "AoE2" como descriptor, no como marca principal. Aviso de "no afiliado a Microsoft" en README y en la web.
- **Reglas de contenido de fans de Microsoft**: leerlas antes de lanzar. Hay que comprobar si permiten publicidad o cualquier monetización.
- **Publicidad**: la decisión actual es financiar con anuncios. Es el punto legal más delicado; resolverlo antes de activar anuncios.
- **Assets**: sprites propios por defecto. La meta es que el visor se vea como el juego (`tasks/08-experiencia-de-juego.md`), pero **no se suben al repo ni al servidor imágenes, sonidos ni íconos extraídos del juego**: no son nuestros para licenciarlos.
  - Opción a evaluar: que el navegador lea los gráficos de **la instalación del propio usuario** y los muestre localmente, sin que pasen por nuestros servidores. Antes de hacerlo, confirmar con las reglas de contenido de Microsoft (Game Content Usage Rules) que está permitido, sobre todo con un sitio que tenga publicidad.
  - La estética de la web (pergamino) usa ilustraciones, texturas y fuentes propias o con licencia libre (Cinzel y Montserrat, SIL OFL). La imagen de referencia de diseño es de terceros y no se publica.
- **Datos personales**: los replays contienen nombres de jugadores y IDs de perfil. Política de privacidad, forma de pedir el borrado y no indexar replays privados.
- **Cookies/anuncios**: aviso de consentimiento donde corresponda.
- **APIs de partidas online** (`tasks/09-partidas-online.md`): la descarga de replays de Microsoft (`aoe.ms` → `api.ageofempires.com`), la API de World's Edge y aoe2companion no están documentadas como públicas ni tenemos acuerdo de uso. Revisar términos, pedir permiso a aoe2companion o limitarse a las oficiales, atribuir las fuentes, cachear y limitar pedidos.
- **Datos de perfiles públicos**: nombres, país, ELO y partidas son públicos en el juego, pero siguen siendo datos personales. Mostrar solo lo necesario, permitir pedir que se oculte un perfil y no indexar más de lo que ya es público.
- **Licencias de dependencias**: `mgz` (MIT, se copió y parcheó `fast/header.py` conservando su aviso), `aoe2rec` (MIT). Registrar cada dependencia que se agregue.
- **`aocref` / aoc-reference-data**: el repo no publica licencia. Se usa solo como dependencia instalada (la trae `mgz`) para poner nombres al parsear; sus datos no se copian al repo. Los colores del visor son propios. Si hace falta incluir datos de referencia en el repo, pedir permiso o una licencia a SiegeEngineers.
