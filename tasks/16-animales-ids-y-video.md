# 16: Animales, IDs de unidades, detalles del motor y video demo

Sesión del 11/11/2026 (tarde), sobre la partida del reporte de Santiago ([`/m/520299380`](https://aoe2replays.sitemaster.com.ar/m/520299380), Black Forest 4v4, 46 min; él es el jugador 6). Se midió con un script qué hace cada aldeano del jugador 6 en cada momento, antes y después de cada cambio.

## Resultado en esa partida (jugador 6, al llegar a Feudal, 16:52)
- Antes: 23 aldeanos parados, 6 en oro, ninguno en bayas.
- Después: 3 parados, 7 en oro, 9 en bayas (construyeron el molino y siguieron), 9 en madera, 5 cazando, 1 en piedra.
- El total de aldeanos bajó a valores creíbles (~33 a los 15 min; antes 38).

## Hecho
- [x] **Jabalíes y animales**: el clic de una orden sobre un animal dice dónde estaba en ese momento. El animal camina hasta ahí, así que el señuelo trae al jabalí y los demás lo comen al lado del TC (antes caminaban hasta donde estaba al principio). Ejemplo real: a las 8:25 un aldeano le pega al jabalí en (124,198); a las 8:58 nueve aldeanos hacen clic sobre él en (107,196), al lado del TC.
- [x] **Comida compartida**: un animal es comida que consumen todos los que lo comen (antes desaparecía según un solo cazador). Cuando se termina, pasan al más cercano del mismo tipo; los peligrosos (jabalí, elefante, rinoceronte, oso) no, porque hay que atraerlos de a uno. "Wild Boar" ahora tiene sus 340 de comida (antes 140).
- [x] **IDs en orden de creación**: el juego reparte los IDs en orden, así que los IDs desconocidos de un jugador, ordenados, son sus unidades en el orden en que salieron. Una pasada previa del motor (solo colas y edificios, ~27 ms) calcula cuándo sale cada unidad, y se emparejan las dos listas sin cruzarse (programación dinámica). Para desempatar se estima cuándo se creó cada ID: no después de la primera orden a cualquier ID mayor. Antes, un error en un jugador corría las ventanas de tiempo de todos y los aldeanos de las ovejas quedaban sin ID.
- [x] **Comandos que no son órdenes** (bengala, mercado, colas, investigaciones, tributos…) ya no cortan lo que hacen las unidades seleccionadas. Una bengala a las 11:14 dejaba parados a 10 cazadores.
- [x] **Campamentos y molino**: quien los construye se pone a recolectar lo que tiene cerca (madera; oro o piedra; bayas), como en DE.
- [x] **Investigaciones en la cola**: Telar, Carretilla, Carro de mano, Vigías y las edades ocupan la cola del TC (antes el TC entrenaba aldeanos mientras investigaba Feudal).
- [x] **Unidades nunca comandadas**: una unidad entrenada cuyo ID no aparece en ninguna orden de toda la partida es dudosa (cola cancelada o murió temprano): hace su primer trabajo y se va, en vez de quedar parada toda la partida.
- [x] Encabezado "Castillo" en la tabla del análisis (con "Castillos" se pisaba con "Imperial").
- [x] **Video demo** en la portada (`public/videos/aoe2-replays-demo-{es,en}.mp4`, 33 s, 2,6 MB, se baja al verse): portada, visor, mapa completo, análisis e IA, sobre la partida anonimizada. Se grabó con `puppeteer-core` + screencast de Chrome contra `next start` y se armó con ffmpeg (títulos con `drawtext`).

## Hotfix aparte (PR #23)
Next 16 descarta el `Content-Encoding` de las respuestas de las rutas (`FORBIDDEN_HEADERS` en `next/dist/server/send-response.js`) y vuelve a comprimir: ninguna partida ni replay cargaba en producción. Ahora `/data` manda el gzip como `application/gzip` y la página lo infla con `DecompressionStream` (`lib/replayJson.ts`).

## Pendiente
- [ ] Mirar la partida de Santiago en el navegador después del deploy y pedirle que confirme.
- [ ] Costo del motor: ~300 ms para 46 min con 8 jugadores (antes ~260). Si molesta en celulares, mover la construcción a un Web Worker.
- [ ] Los tiempos de investigación fuera del TC (herrería, cuarteles…) no se conocen: no frenan la cola. Se podrían sacar con `tools/sprites` a `game-data.json`.
- [ ] Rehacer las capturas estáticas (`public/images/visor/*`, `og.jpg`, `docs/screenshots`) con la orientación nueva. El grabador del video no quedó en el repo: la próxima vez, guardarlo en `tools/` (se puede manejar Chrome por CDP con el `WebSocket` de Node, sin dependencias).
- [x] Música del juego de fondo en los videos demo (12/11/2026), con fundido al entrar y al salir; la imagen no se recomprimió.
