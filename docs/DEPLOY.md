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
MATCH_TTL_DAYS=90        # días que se guarda una partida online desde la última vez que alguien la abrió; 0 = siempre
UPLOADS_PER_HOUR=20      # subidas por IP por hora; 0 = sin límite
SEARCHES_PER_MINUTE=60   # búsquedas de jugadores por IP por minuto; 0 = sin límite
MATCH_IMPORTS_PER_HOUR=20          # partidas online descargadas de Microsoft por IP por hora; 0 = sin límite
MATCH_IMPORTS_PER_HOUR_GLOBAL=300  # lo mismo, para todo el sitio; 0 = sin límite
REGISTRATIONS_PER_HOUR=10           # cuentas creadas por IP; 0 = sin límite
LOGINS_PER_15_MINUTES=20            # intentos de login por IP y por email; 0 = sin límite
MAX_FOLLOWS=20                      # jugadores que puede seguir una cuenta
MAX_ACCOUNT_REPLAYS=200             # replays que guarda una cuenta (no vencen); 0 = sin límite
NOTIFICATION_CHECKS_PER_MINUTE=120  # chequeos de partidas nuevas de todo el sitio; 0 = sin límite
SITE_URL=https://aoe2replays.sitemaster.com.ar   # dirección pública: enlaces canónicos, vista previa en redes, sitemap
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

## Backups
No hay un archivo de la aplicación para copiar: **todo lo que importa está en la base de PostgreSQL de Dokploy** (tablas `replays` y `matches`). Los contenedores `parser` y `web` no guardan nada.

| Qué | Dónde | ¿Backup? |
|---|---|---|
| Replays subidos y partidas | Base PostgreSQL de Dokploy | **Sí.** Los replays subidos no se pueden recuperar de otro lado (el `.aoe2record` no se guarda); las partidas online se pueden volver a bajar mientras Microsoft las tenga |
| `DATABASE_URL`, `IP_HASH_SECRET` y demás variables | Pestaña Environment de Dokploy | **Sí**, en un gestor de contraseñas. Si se pierde `IP_HASH_SECRET`, solo se reinician los límites por IP |
| Código, migraciones y sprites | GitHub | No hace falta |
| `fixtures/` y `apps/web/.env.local` | Solo en la máquina de desarrollo (fuera de git) | Opcional: los replays de prueba no se pueden regenerar |

Los enlaces de gestión siguen andando después de restaurar: el hash del token está en la base.

### Configurarlos en Dokploy
1. Crear un bucket S3 (o compatible) **privado** y agregarlo en `/dashboard/settings/destinations`.
2. En la base: pestaña **Backup**. Elegir el bucket, **Database Name** `aoe2replays`, **Schedule Cron** `0 4 * * *` (todos los días a las 4; la documentación no aclara la zona horaria) y un **Prefix** como `aoe2replays/`.
3. Probar con el botón **Test** y comprobar que el archivo aparece en el bucket.
4. Poner en el bucket una regla que borre los backups de más de 30 días. **Es un tema de privacidad**: un backup conserva los replays que el usuario borró o que expiraron, así que no conviene guardarlos más que la expiración (`REPLAY_TTL_DAYS`).

### Restaurar
Desde Dokploy: pestaña **Backup → Restore**, elegir bucket, archivo y base. Conviene ensayarlo sobre una base nueva, no sobre la de producción.

A mano (Dokploy guarda `pg_dump -Fc` comprimido con gzip):
```sh
pg_dump -d "$DATABASE_URL" -Fc --no-acl --no-owner | gzip > backup.dump.gz
gzip -dc backup.dump.gz | pg_restore -d "$DATABASE_URL_NUEVA" --no-acl --no-owner
```
Este formato se probó con la base local: filas y datos idénticos después de restaurar. Después de restaurar, las migraciones siguen al día porque `_prisma_migrations` viaja en el backup.

## Actualizar
Cada `git push` a `main` + **Deploy** en Dokploy (o activar el auto-deploy por webhook). Las migraciones nuevas se aplican solas antes de que arranque la web.
