# Fase 11: Abrir el repo al público

**Prioridad alta: hacerlo antes de seguir sumando funciones grandes.** Cuanto antes quede el repo seguro y ordenado, menos trabajo hay cuando lleguen colaboradores: cada aporte entra sobre una base revisada, con CI que bloquea errores y reglas claras.

- Web: https://aoe2replays.sitemaster.com.ar/
- Repo: https://github.com/sk8erlucas/aoe2-replays

Orden sugerido: 1 → 2 → 3 en paralelo con 4 → 5 (abrir) → 6.

## 1. Seguridad de la aplicación
Revisión completa del código con estos puntos. Ya conocidos (hallazgos de desarrollo) marcados con ⚠️.

### Entradas y abuso
- [x] ⚠️ **IP del cliente falsificable** (arreglado: se usa `X-Real-IP` o el último `X-Forwarded-For`, que agrega el proxy): `hashIp` toma el primer valor de `X-Forwarded-For`, que el cliente puede inventar para saltar los límites. Usar la IP que agrega el proxy de confianza (Traefik/Dokploy): último valor o `X-Real-IP`, y documentar la configuración de proxies confiables.
- [ ] ⚠️ **Límites en memoria**: los rate limits y la caché de aoe2companion viven en memoria del proceso. Alcanza para una instancia; si se escala, pasarlos a Postgres o Redis.
- [ ] Revisar todos los límites y dejarlos configurables por variable de entorno: subidas por hora, búsquedas por minuto, descargas de partidas por hora, y un **límite global** (no solo por IP) para las descargas de Microsoft.
- [ ] ⚠️ **CAPTCHA** (Cloudflare Turnstile) en la subida anónima y en "Ver partida" si hay abuso. Necesita claves (manual).
- [ ] Tamaño máximo del cuerpo de la petición también en el proxy (Traefik), no solo en la aplicación (hoy Next lee todo el formulario a memoria antes de validar).
- [ ] Validar parámetros de todas las rutas (`/api/players/*`, `/api/matches/*`, `/api/replays/*`) con un esquema (zod o similar) y tests de entradas malformadas.

### Servicio de parseo
- [x] ⚠️ **Tiempo límite que no corta** (arreglado: se matan los procesos del pool y se crea uno nuevo; probado): cuando un parseo supera el tiempo, la API responde 504 pero el proceso trabajador sigue ocupado. Matar el proceso (o reiniciar el pool) al vencer el tiempo.
- [ ] Límite de memoria por proceso de parseo (además del límite del contenedor) y prueba con archivos maliciosos: header que descomprime de más, archivos truncados, ZIPs anidados.
- [ ] Fuzzing básico del parser con replays corruptos (que nunca tumbe el servicio ni devuelva 500 con detalles internos).

### Descarga de partidas (Microsoft)
- [ ] Confirmar protecciones contra SSRF: la URL se arma solo con IDs numéricos y dominio fijo, sin seguir redirecciones (hecho); agregar test.
- [ ] Límite de tamaño descomprimido y de cantidad de entradas del ZIP (hecho el primero); test con zip bomb.
- [ ] ⚠️ **Crecimiento de la tabla `matches`**: cualquiera puede hacer que se guarden partidas (~230 KB cada una). Política de retención (por ejemplo, borrar las no vistas en N días) o tope total.

### Navegador
- [x] Encabezados de seguridad (CSP, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy): Content-Security-Policy (scripts propios, imágenes propias, `connect-src` acotado), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` (salvo la futura vista para insertar).
- [x] Revisar que todo texto del replay o de APIs externas (nombres, chat, clanes) se muestre como texto: el lint de la web prohíbe `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` e `insertAdjacentHTML`.
- [x] Enlaces externos: ninguno abre en otra pestaña (`target="_blank"`), así que no hace falta `rel="noopener"`; el `Referrer-Policy` limita lo que se envía. Si se agrega alguno, llevar `rel="noopener noreferrer"`.

### Datos y privacidad
- [ ] Tokens de gestión: longitud, comparación en tiempo constante (hecho), y que nunca se registren en logs.
- [ ] Logs: no guardar IPs en claro, ni nombres de archivo completos, ni tokens; revisar qué loguea Next y Traefik.
- [ ] Expiración real de replays (hoy se limpian al subir): tarea programada diaria.
- [ ] Página de privacidad y forma de pedir el borrado de un replay o de ocultar un perfil.

### Dependencias
- [x] `npm audit` sin hallazgos; `npm audit` y `pip-audit` corren en el CI; fijar versiones de Python con rango acotado (hoy FastAPI/uvicorn tienen rango amplio).
- [x] Dependabot (npm, pip, Docker, GitHub Actions) con revisión semanal.
- [ ] Revisar licencias de todas las dependencias (registrar en `docs/LEGAL.md`).

## 2. Infraestructura (Dokploy)
- [ ] Backups automáticos de Postgres (diarios, con prueba de restauración).
- [ ] Monitoreo y alertas: caída de la web o del parser, errores 5xx, uso de disco y memoria.
- [ ] Contenedores sin root (parser ya usa `nobody`, web usa `node`), sistema de archivos de solo lectura donde se pueda.
- [ ] HTTPS forzado y HSTS en el dominio.
- [ ] Variables secretas solo en Dokploy (revisar que `IP_HASH_SECRET` no tenga el valor de ejemplo).

## 3. Limpieza del repo antes de abrirlo
- [x] Revisar el **historial completo de git** (no solo los archivos actuales): sin replays, `.env`, claves ni secretos. Solo aparece el apodo de un jugador de una partida pública en un test viejo (2 commits). Si se decide borrarlo, reescribir el historial antes de abrirlo (`git filter-repo`): después ya no tiene sentido.
- [ ] Escaneo de secretos en el historial (gitleaks o el de GitHub).
- [ ] Confirmar que los replays de prueba y la imagen de referencia de diseño siguen fuera de git.

## 4. Preparar la colaboración
- [x] `SECURITY.md`: cómo reportar vulnerabilidades en privado (GitHub Security Advisories).
- [x] `CODE_OF_CONDUCT.md`.
- [x] Plantillas de issue (bug, replay que no se lee, idea) y de pull request (checklist de tests, capturas, licencias de assets).
- [ ] Rama `main` protegida: pull request obligatorio, CI verde obligatorio, sin push directo (vos incluido, salvo emergencias).
- [ ] CI requerido: tests, lint, typecheck, build e imágenes de Docker (ya existe) + CodeQL.
- [ ] Etiquetas `good first issue` / `help wanted` y algunos issues iniciales sacados de `tasks/`.
- [ ] Revisar `CONTRIBUTING.md` y `AGENTS.md` con todo lo anterior.

## 5. Abrir
- [x] Repo → público.
- [x] **Link a la web en el repo**: arriba del README (falta el campo "website" de GitHub, manual).
- [x] **Link al repo en la web**: barra superior, pie de página y preguntas frecuentes.
- [ ] Activar en GitHub: secret scanning, Dependabot alerts, private vulnerability reporting.

## 6. Después de abrir
- [ ] Repetir la revisión de seguridad cada vez que entra una función que recibe datos de afuera (subidas, APIs externas, cuentas).
- [ ] Responder issues y pull requests con los criterios de `CONTRIBUTING.md`.

## Manual (tuyo)
- [ ] Claves de Cloudflare Turnstile.
- [ ] Decidir si se reescribe el historial (paso 3) — conviene hacerlo antes de abrir.
- [ ] Configurar protección de rama y opciones de seguridad en GitHub (o darme permisos para hacerlo con `gh`).
- [ ] Backups y monitoreo en el servidor de Dokploy.
