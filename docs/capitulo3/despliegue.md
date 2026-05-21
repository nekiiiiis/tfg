# Diseño del despliegue

Concreta la **vista física** del sistema: qué nodos ejecutan qué artefactos, cómo se comunican entre sí, qué dependencias externas resuelven y qué garantías ofrecen frente a los requisitos suplementarios.

## Topología

El sistema se despliega como **dos contenedores** Docker orquestados con Docker Compose, comunicados por una red interna y expuestos al exterior por una única conexión TCP/HTTP del servicio de aplicación.

<div align=center>

|Contenedor|Imagen|Función|
|-|-|-|
|`fieldx-app`|Build multi-stage local (`app/Dockerfile`)|Backend Fastify + SPA estático (servido desde `/public`)|
|`fieldx-postgres`|`postgres:16-alpine`|Persistencia transaccional|

</div>

<div align=center>

![Diagrama de despliegue](../../imagenes/capitulo3/diseno-despliegue.svg)

</div>

## Justificación de la topología

<div align=center>

|Decisión|Motivo|Requisito|
|-|-|-|
|**Topología mínima de dos contenedores**|`app` concentra backend, gateway WS y SPA estático (`@fastify/static`); `postgres` aporta la única dependencia de infraestructura|RS-03 (mínima superficie operativa)|
|**Postgres con healthcheck `pg_isready`**|El servicio `app` solo arranca cuando Postgres responde|RS-03|
|**App con healthcheck HTTP `/health`**|Compose detiene/reinicia el contenedor si la salud falla 5 chequeos consecutivos|RS-03|
|**SPA servido por el mismo proceso del backend**|Reduce un punto de fallo y la complejidad de configuración (CORS, certificados)|RS-05|
|**Una sola red `internal` para tráfico interno**|`fieldx-internal` (bridge) une `app` y `postgres`; `fieldx-edge` (bridge) expone `app`|—|
|**Estado caliente in-memory + cola virtual en `notificaciones`**|Cubre los casos de uso sin requerir servicios de infraestructura adicionales (cache distribuida, broker)|RS-03|

</div>

## Redes

<div align=center>

|Red|Tipo|Conecta|Acceso externo|
|-|-|-|-|
|`fieldx-internal`|bridge|`app` ↔ `postgres`|No|
|`fieldx-edge`|bridge|`app` (publicado al host en `:3001`)|Sí|

</div>

`postgres` no expone puertos al host en producción; en desarrollo se mapea `${POSTGRES_PORT:-5432}:5432` para inspección manual.

## Volúmenes

<div align=center>

|Volumen|Servicio|Función|
|-|-|-|
|`fieldx-postgres-data`|`postgres`|`/var/lib/postgresql/data`: datos persistentes de la base de datos|

</div>

Los logs del proceso `app` se emiten a `stdout`/`stderr` y los recoge el runtime del Docker; no se necesita volumen propio. El SPA se copia dentro de la imagen, no requiere volumen.

## Variables de entorno

### Postgres

<div align=center>

|Variable|Valor por defecto|Función|
|-|-|-|
|`POSTGRES_DB`|`infinite_fieldx`|Nombre de la base|
|`POSTGRES_USER`|`fieldx`|Usuario maestro|
|`POSTGRES_PASSWORD`|`fieldx_dev_password_change_me`|Contraseña *(obligatorio sobrescribir en producción)*|
|`POSTGRES_PORT`|`5432`|Puerto publicado al host (solo desarrollo)|

</div>

### App

<div align=center>

|Variable|Valor por defecto / requerido|Función|RS|
|-|-|-|-|
|`NODE_ENV`|`production`|Activa modo producción|—|
|`HOST`|`0.0.0.0`|Interfaz de escucha|—|
|`PORT`|`3001`|Puerto de escucha|—|
|`LOG_LEVEL`|`info`|Nivel de log de `pino`|—|
|`DATABASE_URL`|construida en compose|URL de conexión a Postgres|—|
|`APP_SECRET`|**obligatoria**|Clave maestra para `pgp_sym_encrypt`/`pgp_sym_decrypt`|RS-10|
|`HYPERLIQUID_SOURCE`|`public-ws`|Selección de adaptador (`public-ws` / `nanoreth`)|RS-08|
|`HYPERLIQUID_WS_URL`|`wss://api.hyperliquid.xyz/ws`|Endpoint WebSocket público|—|
|`HYPERLIQUID_INFO_URL`|`https://api.hyperliquid.xyz/info`|Endpoint REST público|—|
|`NANORETH_RPC_URL`|`http://localhost:8545`|Endpoint del nodo no validador (adaptador esqueleto)|RS-08|

</div>

Las variables operativas adicionales (`LEADERBOARD_WINDOW_*_SECONDS`, `LEADERBOARD_PREWARM`, `NOTIFICATION_RETRY_*`, etc.) están documentadas en `src/.env.example` y permiten afinar el comportamiento sin reconstruir la imagen.

## Construcción de la imagen `app`

`app/Dockerfile` usa una build **multi-stage** con tres fases:

<div align=center>

|Fase|Base|Producto|
|-|-|-|
|`web-build`|`node:20-alpine`|`/web/dist`: SPA Vite optimizado|
|`app-build`|`node:20-alpine`|`/app/dist`: backend transpilado + `package-lock.json`|
|`runtime`|`node:20-alpine`|Imagen final con `dist/`, `dist/persistence/migrations`, `public/` (SPA), dependencias de producción, usuario `node`|

</div>

Decisiones de la imagen final:

- `node:20-alpine`: imagen pequeña (~50 MB) y LTS.
- `apk add wget`: requerido por el `healthcheck` de Compose.
- `USER node` (no-root) para reducir la superficie de ataque.
- `npm install --omit=dev`: solo dependencias de producción.

## Flujos de arranque y operación

<div align=center>

|Fase|Servicio|Acción|
|-|-|-|
|Pre-arranque|`postgres`|Compose espera a `pg_isready`|
|Arranque|`app`|`node dist/server.js`. Lectura de `config.ts`, carga de `pgcrypto` y ejecución de migraciones (si el flag operativo lo indica), instanciación de servicios, registro de gateways, suscripción al WS de Hyperliquid|
|Estable|`app`|Procesa peticiones HTTP/WS, mantiene canales abiertos hacia HL, persiste trades en batches, ejecuta el retry worker|
|Apagado|`app`|Cierre limpio de WS hacia HL, flush de buffers de `TradePersistence`, cierre del pool Postgres|

</div>

## Healthchecks

<div align=center>

|Servicio|Endpoint|Frecuencia|Acción Compose|
|-|-|-|-|
|`postgres`|`pg_isready -U $USER -d $DB`|cada 5 s|Marca *unhealthy* tras 10 fallos|
|`app`|`GET /health`|cada 10 s, tras 20 s de gracia|Marca *unhealthy* tras 5 fallos|

</div>

El endpoint `/health` (`app/src/shared/health.ts`) verifica dos puntos: conectividad a Postgres y frescura del flujo de Hyperliquid (último trade < umbral configurable). Cumple **RS-03** porque cualquier degradación se manifiesta como *unhealthy* y dispara el reinicio automático del contenedor.

## Dimensionamiento orientativo

Para una operación 24/7 con prewarm de 9 pares (3 por mercado) y carga de usuarios típica del entorno académico, el dimensionamiento estimado es:

<div align=center>

|Recurso|`app`|`postgres`|
|-|-|-|
|vCPU|1–2|0,5–1|
|RAM|512 MB – 1 GB|512 MB – 1 GB|
|Disco|—|10–30 GB (incluye retención de 8 días de `lb_trades`)|
|Red|≤ 5 Mbps de pico|—|

</div>

La cifra dominante en disco es `lb_trades`: con 9 pares activos y un trade medio de ~50 bytes serializados más índices, ~200–500 MB/día son razonables; la retención de 8 días encaja en 5 GB con holgura.

## Cumplimiento de requisitos suplementarios

<div align=center>

|Requisito|Cómo lo cubre el despliegue|
|-|-|
|**RS-01** ≤ 1 s en leaderboard|App y Postgres en la misma red interna; estado caliente in-memory|
|**RS-02** ≤ 2 s en evaluación|Misma red; índice `alertas_token_estado` cargado en RAM de Postgres|
|**RS-03** 24/7|`restart: unless-stopped`, healthchecks, dos contenedores, retención automática de trades|
|**RS-05** Áreas independientes|SPA servido desde el mismo origen que el API; sin saltos de origen|
|**RS-07** Reintentos|El proceso del worker corre dentro del contenedor `app`; sus reinicios mantienen la cola virtual en Postgres|
|**RS-08** Sustituibilidad de la fuente|`HYPERLIQUID_SOURCE` configura el adaptador en arranque|
|**RS-10** Seguridad del webhook|`APP_SECRET` se inyecta por variable de entorno, nunca queda en imágenes ni en BD|

</div>
