# Fase 10: SEO y redes sociales

Objetivo: que la gente encuentre el sitio buscando partidas o jugadores, y que compartir una partida en redes, Discord o WhatsApp se vea bien y traiga visitas. Para más adelante, cuando el visor y las partidas online estén estables.

## Base técnica
Hoy las páginas de jugador (`/p/<id>`) y de partida (`/m/<id>`) se arman en el navegador: los buscadores y las vistas previas de redes ven una página casi vacía. Lo primero es que el servidor entregue el contenido y los metadatos.

- [ ] Metadatos por página con `generateMetadata` (título, descripción, URL canónica):
  - Portada: qué es y qué hace.
  - Jugador: "Nombre — ELO, civilizaciones favoritas, partidas recientes".
  - Partida: "Mapa · 4v4 · Jugadores · Duración · Ganador".
- [ ] Renderizar en el servidor lo esencial de `/p/<id>` y `/m/<id>` (datos del jugador, resumen de la partida) para que sea indexable; el visor sigue siendo del lado del cliente
- [ ] `robots.txt` y `sitemap.xml`:
  - Indexar: portada, jugadores, partidas online.
  - **No indexar** replays subidos (`/r/<id>`, son privados o de enlace) ni páginas de gestión: `noindex` además de excluirlos del sitemap.
- [ ] Sitemap dinámico de jugadores y partidas vistos, con límite y prioridad por actividad
- [ ] Datos estructurados (JSON-LD): `WebSite` con buscador (`SearchAction` hacia la búsqueda de jugadores), `BreadcrumbList`, y para partidas un tipo genérico (`Event`/`SportsEvent`) si aporta
- [ ] URLs legibles: además del número, slug descriptivo (`/m/516586396-black-forest-4v4`), redirigiendo al canónico
- [ ] Rendimiento (Core Web Vitals): imágenes con tamaño fijo, fuentes autoalojadas (ya), cargar el visor y los sprites solo cuando se usan, medir con Lighthouse en CI
- [ ] Páginas de error y 404 útiles (con buscador) y sin contenido duplicado

## Compartir en redes
- [ ] Open Graph y Twitter Cards en todas las páginas públicas
- [ ] **Imágenes de vista previa generadas** (`next/og`, 1200×630) con el estilo pergamino:
  - Partida: mapa en miniatura (minimapa isométrico), jugadores con civilización y color, duración y ganador.
  - Jugador: nombre, país, ELO por modo, civilizaciones más jugadas.
  - Cacheadas por partida y por jugador.
- [ ] Botones de compartir: copiar enlace (ya), WhatsApp, X, Reddit, Telegram; en móvil, el menú nativo (`navigator.share`)
- [ ] Compartir **un momento**: enlace con tiempo (`/m/<id>?t=12:34`) y opción "compartir este momento" en el visor
- [ ] Vista previa de Discord bien armada (Discord usa Open Graph; probar color de tema y tamaño de imagen)
- [ ] Insertar el visor en otros sitios (`<iframe>` con versión compacta), con enlace de vuelta
- [ ] Clips: exportar un fragmento a video o GIF para redes (se apoya en la fase 5)

## Contenido que trae búsquedas
- [ ] Páginas por mapa y por civilización con estadísticas agregadas de las partidas vistas (win rate, duración media, build orders comunes)
- [ ] Partidas destacadas de jugadores de ELO alto en la portada (se actualiza solo)
- [ ] Guías cortas: dónde están los replays, cómo leer el análisis, qué es APM
- [ ] Idiomas: español e inglés (`hreflang`), empezando por la interfaz y los metadatos

## Medición
- [ ] Google Search Console y Bing Webmaster Tools (verificación por DNS)
- [ ] Analítica respetuosa de la privacidad (Plausible o Umami, sin cookies) para no necesitar banner de consentimiento
- [ ] Registrar qué se comparte (botones usados, vistas que vienen de enlaces compartidos)

## Manual (tuyo)
- [ ] Dominio definitivo (lo pide todo lo de arriba: canónicos, sitemap, Search Console)
- [ ] Nombre del proyecto (ver `docs/LEGAL.md`: las reglas de Microsoft piden no usar el nombre del juego en el título)
- [ ] Cuentas del proyecto en redes (X, Reddit, Discord) si se quiere tener presencia propia
