# 18: Visores de partida

**Objetivo:** paneles arriba del visor, que cada uno elige y ordena, con lo que pasa en la partida en cada momento: cuántos aldeanos tiene cada jugador y en qué recurso está cada grupo, y los puntajes como los que muestra el juego arriba del minimapa. La idea es parecerse al panel del modo espectador del juego (y a herramientas de casteo como Capture Age), pero en el navegador y sobre la repetición.

## Visores
- [ ] **Aldeanos por recurso**, por jugador: total y cuántos en comida, madera, oro, piedra y construyendo (y ociosos, si el motor lo puede saber). Con la muestra de color del jugador al lado del nombre, nunca el nombre en color.
- [ ] **Puntajes**, por jugador, como arriba del minimapa del juego: total y, al desplegar, militar, economía, tecnología y sociedad.
- [ ] Otros que salen del motor y el análisis: población, edad actual (y cuándo llegó), APM del momento.
- [ ] Equipos agrupados en partidas por equipos.

## Configuración
- [ ] Elegir qué visores se ven y en qué orden (arrastrar o subir y bajar), y si van arriba o al costado.
- [ ] Guardarlo en el navegador, y en la cuenta si hay sesión.
- [ ] Atajo para mostrarlos u ocultarlos (sumarlo a la ayuda de `?`).
- [ ] Celular: versión compacta (una fila que se desliza) o desplegable, sin tapar el mapa.
- [ ] Que salgan en la exportación a video ([05](./05-video.md)), con opción de sacarlos.

## De dónde salen los datos
El replay guarda solo las órdenes: todo esto es una estimación del motor y hay que decirlo en la interfaz (como ya se hace con lo estimado).
- **Aldeanos por recurso:** `engine.js` ya lleva `gatherers` (qué junta cada unidad) con tasas de `palette.js`. Falta exponer un resumen por jugador en el instante `t` (función sin DOM, testeable en Node).
- **Puntajes:** el replay no los trae y el juego los calcula con su motor. Se pueden aproximar con las mismas reglas del juego: tecnología (investigaciones hechas), economía (recursos juntados, estimados), sociedad (maravillas, castillos, reliquias) y militar (unidades y edificios destruidos, que en combate es lo menos exacto). Mostrarlos como "estimado" y explicar en un tooltip cómo se calculan. Si el desvío es muy grande, mostrar solo los componentes confiables.
- Comparar contra partidas reales: anotar los puntajes y aldeanos que muestra el juego en algunos momentos de un replay de `fixtures/` y medir la diferencia.

## Reglas del repo
- Textos en `apps/web/src/i18n/messages.ts`, en español e inglés.
- Estilo de [`docs/DESIGN.md`](../docs/DESIGN.md).
- El cálculo en `packages/viewer` (sin DOM, con tests); el dibujo y los paneles en la web.

## Criterio de terminado
- [ ] Se pueden elegir y ordenar los visores, y la elección se recuerda.
- [ ] Aldeanos por recurso y puntajes se ven en partidas 1v1 y por equipos, en escritorio y celular.
- [ ] Lo estimado está marcado como tal y medido contra al menos una partida real.
