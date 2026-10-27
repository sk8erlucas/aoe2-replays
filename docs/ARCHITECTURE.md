# Arquitectura (propuesta)

## Servicios
1. **web** (Next.js + TypeScript): UI, auth opcional, subida de archivos, API pública, visor en canvas.
2. **parser** (Python + FastAPI + `mgz` parcheado): recibe un replay, devuelve JSON normalizado. Sin estado.
3. **db** (Postgres + Prisma): usuarios, replays, metadatos, tokens de enlace.
4. **storage**: disco local o S3 compatible para los `.aoe2record` y los JSON parseados.
5. **queue** (opcional al inicio): cola de trabajos de parseo. Empezar con una tabla en Postgres y evolucionar si hace falta.

Se separa el parser en su propio servicio porque `mgz` es Python y porque el parseo es CPU intensivo y no debe bloquear la web. Si más adelante conviene Rust (`aoe2rec`) o WASM en el navegador, se reemplaza el servicio sin tocar la web, siempre que respete el mismo contrato JSON.

## Flujo
1. Usuario sube el `.aoe2record` (con o sin cuenta).
2. `web` valida tamaño y firma del archivo, lo guarda y crea un registro con estado `pending`.
3. Un worker llama a `parser`, guarda el JSON normalizado y marca `ready` (o `failed` con el motivo).
4. El visor en el navegador descarga el JSON y reproduce en canvas.
5. Export a video: en el navegador con `MediaRecorder` sobre el canvas (primera versión).

## Contrato JSON del parser (borrador)
```json
{
  "schema_version": 1,
  "game": { "version": "VER 9.4", "save_version": 68.9, "map": {}, "players": [] },
  "initial_objects": [],
  "timeline": [{ "t": 0, "type": "BUILD", "player": 1, "x": 99, "y": 209, "building_id": 70 }]
}
```

## Privacidad y acceso
- Replays privados por defecto.
- Se comparten solo si el dueño hace público el enlace. Enlace con identificador aleatorio no adivinable (mínimo 128 bits).
- Subida sin cuenta: se entrega un token secreto de gestión (borrar o hacer público) guardado en el navegador y en un enlace de gestión.
- Los replays anónimos expiran tras N días (a definir).

## Abuso y costos
- Límite de tamaño por archivo y de subidas por IP.
- CAPTCHA (por ejemplo Cloudflare Turnstile) en subida anónima.
- Validar que el archivo sea un `.aoe2record` real antes de parsearlo; el parser corre aislado y con tiempo y memoria limitados (el header descomprime a ~19 MB, hay riesgo de archivos que expandan de más).

## Despliegue
Dokploy en servidor propio, un contenedor por servicio.
