# Fixtures

Replays de prueba. Los `.aoe2record` y los `.json` generados **no se suben al repo** (traen nombres y perfiles de jugadores), están en `.gitignore`.

Los tests del parser esperan:

| Archivo | Versión | Partida |
|---|---|---|
| `AgeIIDE_Replay_516585531.aoe2record` | VER 9.4, save 68.9, build 185872 | 4v4, mapa 220×220, ~51 s (abandonos tempranos) |
| `AgeIIDE_Replay_516586396.aoe2record` | save 68.9 | 4v4 Black Forest, 48 min, partida completa. Se descarga con `https://aoe.ms/replay/?gameId=516586396&profileId=5675276` (ZIP) |

Si falta un archivo, los tests que lo usan se saltean.
