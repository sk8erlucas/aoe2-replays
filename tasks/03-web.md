# Fase 3: Web (Next.js)

- [x] Proyecto Next.js con TypeScript en `apps/web`
- [x] Interfaz mínima de prueba: subir replay → parsear → ver (sin guardar)
- [ ] Postgres + Prisma: usuarios, replays, estados, tokens de enlace
- [ ] Subida de `.aoe2record` sin cuenta (flujo principal)
- [~] Validación de tamaño y extensión (hecho); firma del archivo, CAPTCHA y límite por IP en subidas anónimas
- [ ] Token de gestión para replays anónimos (borrar, hacer público)
- [ ] Expiración automática de replays anónimos
- [ ] Cola de parseo y worker que llama al servicio `parser`
- [ ] Estados `pending` / `ready` / `failed` con mensaje claro
- [~] Visor en la web (hecho); falta página propia por replay `/r/<id>`
- [ ] Privacidad: privado por defecto; enlace público con identificador aleatorio
- [ ] Auth.js: registro y login opcionales
- [ ] "Mis replays" para usuarios registrados
- [ ] Reclamar un replay anónimo al registrarse
- [~] Contenedores (Dockerfiles y `docker-compose.yml` escritos, sin probar) y despliegue en Dokploy
- [ ] Política de privacidad y borrado
- [ ] Espacios publicitarios y consentimiento de cookies (solo después de resolver `docs/LEGAL.md`)
