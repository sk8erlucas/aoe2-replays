# Fase 5: Exportar a video

> Movido a `done/` el 25/11/2026: lo que quedaba abierto pasó a [`PENDIENTES.md`](../PENDIENTES.md) y lo que hay que probar a mano, a [`PRUEBAS.md`](../PRUEBAS.md).

Botón "🎬 Video" en la barra del visor (`VideoExport.tsx`), con el grabador en `packages/viewer/src/video.js` (entrada aparte, `@aoe2-replays/viewer/video`, que la web carga recién al abrir el diálogo).

- [x] Prueba de concepto con `MediaRecorder` sobre el canvas (12/11/2026): **descartado**. Graba con el reloj real, así que un fotograma lento (sprites decodificándose) estiraba el video y los que se mandaban para recuperar el tiempo se perdían (117 de 150 en 5 s). Pausar el grabador mientras se dibuja no lo arregló en Chrome.
- [x] Render por fotogramas con WebCodecs (`VideoEncoder`) y [Mediabunny](https://mediabunny.dev) (MPL-2.0) para armar el archivo: cada fotograma lleva su tiempo exacto y sale más rápido que el tiempo real. Medido en Chrome: 10 s de 720p en ~2 s; 60 s de 1080p en 16 s (1800 fotogramas, 60,000 s exactos).
- [x] Formatos: MP4 (H.264) si el navegador lo codifica, si no WebM (VP9/VP8). Chrome, Edge, Safari 16.4+ y Firefox 130+ tienen WebCodecs; sin él, el diálogo lo dice.
- [x] Opciones: desde/hasta (m:ss, con "desde el momento actual"), velocidad (4×, 8×, 16×, 32×), 720p o 1080p. Estimación de duración y peso (~3,7 Mbps en 720p, ~8,3 en 1080p).
- [x] Barra de progreso y cancelación; al terminar se descarga solo y queda el enlace "Descargar".
- [x] Marca de agua opcional con la dirección del sitio; reloj y jugadores con su color arriba a la izquierda.
- [x] La cámara arranca con el modo de seguimiento del visor (auto, un jugador o libre). **Encuadre** (21/11/2026): Cerca, Media (nueva por defecto: la del visor se veía muy de cerca), Lejos, Mapa entero o Como en el visor; medido sobre el lado corto, así 1080p y vertical encuadran igual que 720p. **A quién sigue y niebla** (22/11/2026): el diálogo deja elegir a quién sigue la cámara (la acción, automática, o un jugador; nunca libre, porque no se movería) y la niebla de guerra (sin niebla o como la vio un jugador), arrancando con lo que muestra el visor.
- [x] Render en servidor: no hace falta por ahora (todo corre en el navegador, sin costo).
- [ ] Probar en Safari, Firefox y en un celular (solo se probó Chrome de escritorio, también con la web real). **La música, el vertical y los encuadres nuevos no se probaron en un navegador** (21/11/2026).
- [x] Música de fondo en el video (21/11/2026): opción "Música del juego" (activada); las pistas de `public/music` desde una al azar, una tras otra, con entrada y salida suaves, en AAC (MP4) u Opus (WebM) a 128 kbps. Si el navegador no puede codificar audio, el video sale mudo.
- [x] Partidas largas en 1080p pesan mucho (una de 25 min a 16× da ~95 s y ~100 MB): desde el 22/11/2026 el diálogo avisa si el video va a pasar los 300 MB y sugiere cómo achicarlo. Como se genera y se queda en el dispositivo de quien lo exporta, no se baja el bitrate.
- [x] Opción vertical (9:16) para redes (21/11/2026): "Formato" horizontal o vertical (720×1280 / 1080×1920).
