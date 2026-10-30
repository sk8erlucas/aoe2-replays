# sprites

Extrae los gráficos de Age of Empires II: DE a atlas WebP + `manifest.json` para el visor (`apps/web/public/sprites/`). Hace falta tener el juego instalado; el resultado se commitea, así que solo se corre cuando cambia la lista de gráficos o una actualización del juego.

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Linux/macOS: .venv/bin/python
.venv/Scripts/python extract.py --game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE" --out ../../apps/web/public/sprites
.venv/Scripts/python terrain.py --game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE" --out ../../apps/web/public/sprites
```

## Cómo funciona
- [`sld.py`](sld.py) decodifica los `.sld` de DE (bloques BC1 para color, BC4 para sombra y máscara de color de jugador). Formato: [documentación de openage](https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md), con dos correcciones comprobadas: los bits de capas se cuentan desde el más significativo (capa principal = `0x01`) y el quinto campo de la cabecera es su tamaño (16 o 14 bytes).
- [`extract.py`](extract.py) lee el archivo de datos del juego (`empires2_x2_p1.dat`, con [genieutils-py](https://github.com/SiegeEngineers/genieutils-py)) para saber qué gráfico usa cada civilización:
  - edificios por edad, siguiendo los efectos "mejorar unidad" de Feudal, Castillos e Imperial (cada civilización tiene su arquitectura);
  - centro urbano armado con sus partes (anexos) y desplazamientos;
  - aldeanos, explorador y unidades comunes: quieto (16 direcciones) y caminando (8 cuadros por dirección);
  - árboles (4 variantes por tipo), minas, arbustos, reliquias y animales.
- [`terrain.py`](terrain.py) pasa las texturas de terreno (`resources/_common/terrain/textures/2x/*.dds`, 128 texeles por lado de tile) a WebP de 32 texeles por tile en `terrain/`, y escribe `terrain.json` con qué textura usa cada ID de terreno (campo `name_2` del archivo de datos), cada cuántos tiles se repite y su color promedio. El visor proyecta la textura en isométrico y baja solo las que usa el mapa.
- `manifest.json` lleva las páginas, los cuadros, Gaia y los aldeanos; lo de cada civilización (edificios por edad, unidades, escombros) va en `civs/<id>.json`, y el visor baja solo las civilizaciones de la partida.
- Recorta, escala (0,75 → tiles de 64 px como el zoom cercano del visor) y empaqueta en páginas de hasta 4096 px. La máscara de color de jugador va en una imagen aparte (`*-mask.webp`) que el visor tiñe con el color de cada jugador.

El arte es de Microsoft, usado bajo las Game Content Usage Rules (ver `docs/LEGAL.md`). genieutils-py es LGPL-3.0 y solo se usa en esta herramienta, no se distribuye con la web.
