# Pendientes

Separados entre lo que necesita una decisión o acción tuya y lo que se puede avanzar sin vos.

## Manual (necesita tu decisión o acción)
| Tema | Qué hace falta | Bloquea |
|---|---|---|
| Repo en GitHub | Instalar `gh` y `gh auth login`, o crear el repo privado y pasar la URL | Subir el código, CI |
| Diseño visual | Definir identidad, paleta, tipografía y estilo del mapa ([07-diseno](./07-diseno.md)) | Rediseño de la web y sprites |
| Replays de prueba | Pasar 2-3 replays: partida completa, 1v1, versión 66/67 | Probar el visor de verdad y los parches |
| Docker local | El build falla por certificados SSL en esta máquina (antivirus o proxy que intercepta HTTPS) | Probar `docker compose` local |
| Legal | Leer reglas de contenido de fans de Microsoft ([LEGAL](../docs/LEGAL.md)) | Publicidad, lanzamiento |
| Nombre y dominio | Verificar disponibilidad y comprar | Despliegue público |
| Hosting | Servidor para Dokploy | Despliegue |
| Decisiones abiertas | Expiración de replays, tamaño máximo, idiomas ([DECISIONS](../docs/DECISIONS.md)) | Persistencia |

## Automático (se puede avanzar sin vos)
- [ ] Persistencia: Postgres + Prisma, guardar replays con enlace privado y token de gestión
- [ ] Cola de parseo y estados `pending` / `ready` / `failed`
- [ ] Página `/r/<id>` para cada replay
- [ ] CI de GitHub Actions (tests de parser, viewer, lint y build de la web), listo para cuando exista el repo
- [ ] Lint y formato para Python (ruff)
- [ ] Análisis básico: build order, APM y línea de tiempo por jugador
- [ ] Vista isométrica del mapa (independiente del diseño final)
- [ ] Exportar a video con `MediaRecorder` (prueba de concepto)
