# Diagrama de despliegue

## Propósito

El diagrama de despliegue compromete las decisiones lógicas de los apartados anteriores con la **infraestructura física** sobre la que el sistema correrá: nodos, contenedores, procesos, redes y volúmenes. Cierra el Capítulo 3 fijando un escenario reproducible que el Capítulo 4 podrá levantar con un único comando.

<div align=center>

||||
|-|-|
|**Punto de partida**|Vista física preliminar del [Diseño de la arquitectura](disenoArquitectura.md), restricciones de RS-03 (24/7) y RS-08 (sustituibilidad)|
|**Resultado**|Diagrama UML de despliegue, fichero `docker-compose.yml` conceptual, esquema de redes y volúmenes, política de health checks y reinicios|
|**Restricción**|Self-hosting sobre la infraestructura de Infinite Fieldx; un único nodo físico; reproducible por cualquier desarrollador con `docker compose up`|

</div>

## Vista de despliegue

El sistema se despliega como **cuatro contenedores** sobre un único nodo Docker, compartiendo dos redes virtuales y tres volúmenes persistentes.

<div align=center>

![Diagrama de despliegue](../../imagenes/capitulo3/diseno-despliegue.svg)

</div>

### Nodos y contenedores

<div align=center>

|Contenedor|Imagen base|Función|Subsistemas alojados|
|-|-|-|-|
|`backend`|`node:20-alpine` *(custom build)*|Servidor NestJS: REST + WS + handlers de eventos|S-PRES (HTTP+WS), S-INGE, S-LEAD, S-CATA, S-ALER, S-EVAL, S-NOTI|
|`frontend`|`nginx:alpine` *(custom build)*|Servidor estático que sirve el bundle React + reverse proxy hacia `backend`|*(parte de S-PRES)*|
|`postgres`|`postgres:16-alpine`|RDBMS: catálogo, alertas, notificaciones|*(persistencia de S-CATA, S-ALER, S-NOTI)*|
|`redis`|`redis:7-alpine`|Estado caliente: leaderboard + cola de reintentos|*(estado de S-LEAD, S-NOTI)*|

</div>

### Procesos y comunicación

<div align=center>

|Origen|Destino|Protocolo|Puerto|Naturaleza|
|-|-|-|-|-|
|Usuario *(navegador)*|`frontend`|HTTPS|443|Servir bundle estático (React build)|
|Usuario *(navegador)*|`backend` *(vía proxy nginx)*|HTTPS|443|REST API + WebSocket upgrade|
|`backend`|`postgres`|TCP/SQL|5432|Consultas y mutaciones; pool de conexiones TypeORM|
|`backend`|`redis`|TCP/RESP|6379|ZINCRBY, ZRANGE, LPUSH, BRPOP|
|`backend`|Hyperliquid L1|WebSocket *(saliente)*|Internet|Suscripción a feeds (operaciones, precios)|
|`backend`|Servicio Webhook (n8n)|HTTPS *(saliente)*|Internet|POST de notificaciones (RS-10)|

</div>

> El `frontend` y el `backend` se publican tras un único punto de entrada (nginx en `frontend`) que termina TLS y enruta `/api/*` al `backend`. El usuario solo ve un puerto.

## Redes Docker

<div align=center>

|Red|Tipo|Conecta|Razón|
|-|-|-|-|
|`fieldx-edge`|`bridge`|`frontend` ↔ exterior|Red expuesta al host. Solo la usa el contenedor que termina TLS|
|`fieldx-internal`|`bridge`|`backend` ↔ `postgres` ↔ `redis` ↔ `frontend`|Red privada para tráfico interno. PostgreSQL y Redis **no se exponen al host**|

</div>

> La separación impide que `postgres` o `redis` queden accesibles desde el exterior. El único puerto expuesto al host es 443 (frontend).

## Volúmenes persistentes

<div align=center>

|Volumen|Montado en|Persistencia|Backup|
|-|-|-|-|
|`fieldx-postgres-data`|`/var/lib/postgresql/data`|RS-03 (24/7) — datos del catálogo, alertas y notificaciones|`pg_dump` programado|
|`fieldx-redis-data`|`/data`|AOF habilitado — supervivencia del leaderboard y la cola de reintentos|*(no crítico — reconstruible)*|
|`fieldx-backend-logs`|`/var/log/backend`|Logs estructurados rotados|*(no crítico)*|

</div>

## Composición Docker Compose

```yaml
version: '3.9'

services:
  frontend:
    build: ./frontend
    image: fieldx/frontend:latest
    container_name: fieldx-frontend
    ports:
      - "443:443"
    networks:
      - fieldx-edge
      - fieldx-internal
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD","wget","-qO-","http://localhost/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

  backend:
    build: ./backend
    image: fieldx/backend:latest
    container_name: fieldx-backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://fieldx:${POSTGRES_PASSWORD}@postgres:5432/fieldx
      REDIS_URL: redis://redis:6379
      HYPERLIQUID_WS_URL: ${HYPERLIQUID_WS_URL}
      APP_SECRET: ${APP_SECRET}
    networks:
      - fieldx-internal
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - fieldx-backend-logs:/var/log/backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD","node","-e","require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  postgres:
    image: postgres:16-alpine
    container_name: fieldx-postgres
    environment:
      POSTGRES_DB: fieldx
      POSTGRES_USER: fieldx
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    networks:
      - fieldx-internal
    volumes:
      - fieldx-postgres-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL","pg_isready -U fieldx"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: fieldx-redis
    command: ["redis-server","--appendonly","yes"]
    networks:
      - fieldx-internal
    volumes:
      - fieldx-redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD","redis-cli","ping"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  fieldx-edge:
    driver: bridge
  fieldx-internal:
    driver: bridge
    internal: false  # backend necesita salir a Hyperliquid y al webhook

volumes:
  fieldx-postgres-data:
  fieldx-redis-data:
  fieldx-backend-logs:
```

> El fichero anterior es la **versión conceptual**. La versión final (Capítulo 4) incorporará detalles operativos (políticas de log driver, límites de recursos, init system).

## Política de salud y reinicios

<div align=center>

|Aspecto|Decisión|RS|
|-|-|-|
|`restart: unless-stopped`|Tras crash o reboot del host, el contenedor vuelve a arrancar automáticamente|RS-03|
|Health checks Docker|Cada servicio expone una sonda. `depends_on: condition: service_healthy` impide que `backend` arranque antes de `postgres` y `redis`|RS-03|
|Endpoint `/health` del backend|Implementado con `@nestjs/terminus`. Verifica conectividad con Postgres, Redis y la última recepción WS de Hyperliquid|RS-03, RS-08|
|Reconexión automática del WS de Hyperliquid|`HyperliquidConnector` reintenta con backoff exponencial; si la conexión cae más de 60 s, marca `/health` como degraded para alertar|RS-03, RS-08|

</div>

## Variables de entorno

Todas las variables sensibles se inyectan desde un fichero `.env` que **no se versiona** (`.env.example` sí, sin secretos).

<div align=center>

|Variable|Tipo|Uso|
|-|-|-|
|`POSTGRES_PASSWORD`|secreto|Conexión `backend` → `postgres`|
|`APP_SECRET`|secreto|Clave maestra para `pgp_sym_encrypt` (RS-10)|
|`HYPERLIQUID_WS_URL`|configuración|Endpoint del feed de Hyperliquid (sustituible por nodo no validador, RS-08)|
|`LOG_LEVEL`|configuración|`info` por defecto, `debug` en desarrollo|

</div>

## Sustituibilidad de la frontera (RS-08)

La sustitución del proveedor de Hyperliquid (API pública ↔ nodo no validador) se realiza **sin tocar código**, cambiando dos elementos:

<div align=center>

|Cambio|Mecanismo|
|-|-|
|`HYPERLIQUID_WS_URL`|Variable de entorno: apunta al nuevo endpoint|
|*(opcional)* implementación de `IHyperliquidPort`|Si el protocolo del nodo no validador difiere, se proporciona una segunda implementación en `infrastructure/connectors/hyperliquid/` y se cambia el provider en `IngestionModule`|

</div>

> El núcleo del sistema no cambia: el adapter es el único que conoce el protocolo concreto.

## Despliegue inicial

<div align=center>

|Paso|Comando|
|-|-|
|1|Clonar el repositorio|
|2|`cp .env.example .env` y rellenar valores|
|3|`docker compose build`|
|4|`docker compose run --rm backend npm run migration:run` *(crea esquema Postgres)*|
|5|`docker compose up -d`|
|6|*(si HTTPS)* desplegar certificado en `frontend`|
|7|Comprobar `https://<host>/health`|

</div>

> En aproximadamente 7 pasos el sistema queda corriendo. Esto materializa la promesa de "self-hosting reproducible" del Capítulo 1.

## Validación del despliegue

<div align=center>

|Criterio|Comprobación|
|-|-|
|**Disponibilidad 24/7 (RS-03)**|`restart: unless-stopped` + health checks + datos persistentes en volumen|
|**Sustituibilidad (RS-08)**|El proveedor Hyperliquid es una variable de entorno + interfaz de adapter|
|**Confidencialidad (RS-10)**|Webhook cifrado en BD; `APP_SECRET` solo en `.env` y entorno del contenedor|
|**Reproducibilidad**|`docker compose up` desde un repo limpio produce un sistema funcional sin pasos manuales|
|**Escalabilidad limitada al alcance**|Un único nodo. La descomposición lógica en módulos NestJS deja preparada una eventual descomposición en microservicios cuando RS lo exija|

</div>

## Trazabilidad

<div align=center>

|De|A|Mecanismo|
|-|-|-|
|[Diseño de la arquitectura](disenoArquitectura.md)|Esta especificación|Cada subsistema lógico se mapea a un proceso/contenedor|
|[Modelo de datos](modeloDeDatos.md)|Volúmenes Postgres y Redis|Persistencia de las tablas y estructuras descritas|
|RS-03, RS-08, RS-10|Health checks, variables, cifrado|Cada decisión cita el RS|
|Capítulo 4|`Dockerfile`, `docker-compose.yml`, scripts de despliegue|La versión final del compose file es la primera entrega operativa del Capítulo 4|

</div>
