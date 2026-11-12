# tools/music

Saca la música de partida de una instalación de Age of Empires II: DE para el botón "Música" del visor (`apps/web/public/music`). Igual que `tools/sprites`, necesita el juego instalado y no se incluye en la web.

El audio del juego está en paquetes de Wwise (`wwise/*.pck`). Las pistas de música son los `.wem` más grandes de `Base.pck` (~4 MB, 4–5 minutos), en Wwise Opus (códec `0x3041`): paquetes Opus pegados uno tras otro, con sus tamaños en el bloque `seek`. `wem2ogg.py` los envuelve en Ogg Opus sin recomprimir, y ffmpeg los pasa a AAC (lo reproduce cualquier navegador). Sin dependencias: Python y ffmpeg.

```sh
GAME="C:/Program Files (x86)/Steam/steamapps/common/AoE2DE"
python pck.py "$GAME/wwise/Base.pck" 20                 # los archivos más grandes
python extract.py "$GAME/wwise/Base.pck" out/wem 3000000
python wem2ogg.py out/wem/253623142.wem out/253623142.ogg
ffmpeg -i out/253623142.ogg -c:a aac -b:a 96k -movflags +faststart -map_metadata -1 ../../apps/web/public/music/track-01.m4a
```

Los IDs no dicen el nombre de la pista; se eligieron por duración y volumen (arrancan con música desde el primer segundo). Las pistas son © Microsoft, usadas bajo las Game Content Usage Rules: registrar cualquier archivo nuevo en `apps/web/public/images/CREDITS.md`.

Pistas actuales: `track-01` ← 253623142, `02` ← 156706476, `03` ← 897910924, `04` ← 903478877, `05` ← 434677469, `06` ← 255716020.
