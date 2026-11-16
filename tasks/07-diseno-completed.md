# Fase 7: Diseño visual

Dirección elegida: **pergamino ilustrado**. Guía completa en [`docs/DESIGN.md`](../docs/DESIGN.md); la web ya la aplica. El aspecto del mapa (que se parezca al juego) está en [`08-experiencia-de-juego.md`](./08-experiencia-de-juego.md).

Cerrado el 16/11/2026. Lo que queda (ilustraciones, íconos de línea propios y decidir el modo oscuro) es opcional y está en la sección "Pendiente" de [`docs/DESIGN.md`](../docs/DESIGN.md).

## A definir (manual: decisiones tuyas)
- [x] Tono: temático medieval, pergamino y tinta
- [x] Logo: escudo almenado de bronce con un triángulo de reproducción (`public/images/logo.svg`, favicon en `src/app/icon.svg`)
- [x] Paleta (claro; el modo oscuro quedó como pendiente opcional en DESIGN.md)
- [x] Tipografía: Cinzel + Montserrat
- [x] Estilo del mapa: isométrico, buscando parecerse al juego (ver fase 8)
- [x] Referencia visual (guardada fuera de git en `docs/design/referencias/`)
- [x] Estructura de páginas: portada, replay (`/r`), jugador (`/p`), partida (`/m`), cuenta y "Mis replays", favoritos, herramientas; el análisis va dentro del visor

## Lo que puedo hacer después de definirlo
- [x] Tokens de diseño (CSS variables) y componentes base
- [x] Rediseñar inicio, subida y visor con esos tokens
- [x] Logo/favicon propio
- [~] Ilustraciones propias en estilo grabado (portada, 404, estados vacíos): pasa a DESIGN.md como opcional; la portada usa arte oficial del juego
- [-] Sprites propios para unidades y edificios: descartado, se usan los del juego ([08](./08-experiencia-de-juego.md), [14](./14-calidad-grafica.md))
- [-] Mockups o prototipo navegable: ya no hace falta, la web está hecha
