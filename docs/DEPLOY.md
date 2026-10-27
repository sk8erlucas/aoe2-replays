# Despliegue en Dokploy

El stack es `docker-compose.yml` (raíz del repo):

| Servicio | Qué hace | Expuesto |
|---|---|---|
| `parser` | Convierte replays a JSON (FastAPI, puerto 8000) | No, solo lo usa `web` |
| `migrate` | Aplica las migraciones de Prisma y termina | No |
| `web` | Next.js (puerto 3000) | Sí, por el dominio de Dokploy |

La base de datos no está en el compose: se crea aparte en Dokploy y se pasa por `DATABASE_URL`.

## 1. Subir el código a GitHub
Crear un repo **privado** vacío (sin README) en GitHub y, desde la carpeta del proyecto:

```sh
git remote add origin git@github.com:<tu-usuario>/aoe2-replays.git   # o la URL https
git push -u origin main
```

## 2. Base de datos en Dokploy
1. En el proyecto de Dokploy: **Create Service → Database → PostgreSQL** (versión 16 o 17).
2. Ponerle nombre, usuario, contraseña y base (por ejemplo `aoe2replays`). Desplegarla.
3. Copiar la **Internal Connection URL**. Tiene esta forma:
   `postgresql://usuario:contraseña@<host-interno>:5432/aoe2replays`
   No hace falta exponerla a internet.

## 3. La aplicación
1. **Create Service → Compose**.
2. Proveedor **GitHub** (conectar la cuenta si no está), repo `aoe2-replays`, rama `main`, **Compose Path** `./docker-compose.yml`.
3. Pestaña **Environment**: pegar las variables del punto 4.
4. **Deploy**. El primer build tarda unos minutos.
5. Pestaña **Domains → Add Domain**: servicio `web`, puerto `3000`, tu dominio, HTTPS con Let's Encrypt. Apuntar el DNS (registro A) a la IP del servidor.

## 4. Variables de entorno
```env
# Obligatorias
DATABASE_URL=postgresql://usuario:contraseña@host-interno:5432/aoe2replays
IP_HASH_SECRET=<generar con: openssl rand -hex 32>

# Opcionales (valor por defecto)
REPLAY_TTL_DAYS=30       # días hasta borrar un replay; 0 = nunca
UPLOADS_PER_HOUR=20      # subidas por IP por hora; 0 = sin límite
```
`PARSER_URL` no hace falta: el compose ya la apunta a `http://parser:8000`.

Para generar `IP_HASH_SECRET` sin `openssl`, en PowerShell:
```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

## 5. Verificar
- `https://<tu-dominio>` muestra la página para subir replays.
- En **Logs** de `migrate` debería decir que aplicó las migraciones y terminar con código 0.
- Subir un replay: tiene que redirigir a `/r/<id>`. Desde otro navegador (o en modo incógnito), ese enlace tiene que decir "No encontramos este replay" hasta que lo hagas público.

## Si algo falla
| Síntoma | Causa probable |
|---|---|
| `network dokploy-network not found` | El compose usa la red de Dokploy; solo existe en el servidor de Dokploy. Para probarlo en otra máquina: `docker network create dokploy-network`. |
| `migrate` falla con error de conexión | `DATABASE_URL` mal copiada o la base no está desplegada. Usar la URL **interna**. |
| `set DATABASE_URL` / `set IP_HASH_SECRET` al desplegar | Falta esa variable en Environment. |
| El dominio da 404 o "Bad Gateway" | El dominio no está asociado al servicio `web` con puerto `3000`, o falta redeploy después de agregarlo. |
| "El servicio de parseo no responde" | El contenedor `parser` no arrancó: revisar sus logs. |
| Subidas grandes fallan antes de llegar | Límite de tamaño del proxy; los replays rara vez pasan los 10 MB. |

Las imágenes de Docker todavía no se construyeron fuera de la máquina de desarrollo (allí falla por certificados SSL interceptados). El primer deploy es también la primera prueba real de los Dockerfiles: si falla el build, pasame el log.

## Actualizar
Cada `git push` a `main` + **Deploy** en Dokploy (o activar el auto-deploy por webhook). Las migraciones nuevas se aplican solas antes de que arranque la web.
