# Diagrama de despliegue

## Propósito

El diagrama de despliegue compromete las decisiones lógicas de los apartados anteriores con un **modelo físico** de nodos, contenedores, redes y volúmenes que el Capítulo 4 podrá materializar. El objetivo de esta sección es fijar el **esqueleto de despliegue** —qué se ejecuta dónde, cómo se comunican los procesos y dónde se persiste el estado—, no producir los ficheros de orquestación.

<div align=center>

|||
|-|-|
|**Punto de partida**|Vista física preliminar del [Diseño de la arquitectura](disenoArquitectura.md), restricciones de RS-03 (24/7) y RS-08 (sustituibilidad)|
|**Resultado**|Diagrama UML de despliegue, asignación de subsistemas a contenedores, esquema de redes y volúmenes, política de salud y reinicios|
|**Restricción**|Self-hosting sobre la infraestructura de Infinite Fieldx; un único nodo físico; la operación de despliegue debe ser reproducible *(los ficheros concretos de orquestación se entregan en el Capítulo 4)*|

</div>

## Vista de despliegue

El sistema se despliega como **cuatro contenedores** sobre un único nodo, comunicándose a través de dos redes virtuales y persistiendo en tres volúmenes.

<div align=center>

![Diagrama de despliegue](../../imagenes/capitulo3/diseno-despliegue.svg)

</div>

### Nodos y contenedores

<div align=center>

|Contenedor|Tecnología base|Función|Subsistemas alojados|
|-|-|-|-|
|`backend`|Runtime Node.js + framework NestJS|Servidor REST + WebSocket + handlers de eventos del bus|S-PRES (HTTP+WS), S-INGE, S-LEAD, S-CATA, S-ALER, S-EVAL, S-NOTI|
|`frontend`|Servidor estático (reverse proxy)|Sirve el bundle SPA y termina TLS, enrutando `/api/*` al `backend`|*(parte de S-PRES)*|
|`postgres`|RDBMS PostgreSQL|Persistencia de catálogo, alertas y notificaciones|*(persistencia de S-CATA, S-ALER, S-NOTI)*|
|`redis`|Almacén clave-valor en memoria con AOF|Estado caliente: leaderboard + cola de reintentos|*(estado de S-LEAD, S-NOTI)*|

</div>

### Procesos y comunicación

<div align=center>

|Origen|Destino|Protocolo|Naturaleza|
|-|-|-|-|
|Usuario *(navegador)*|`frontend`|HTTPS|Servir bundle estático|
|Usuario *(navegador)*|`backend` *(vía proxy)*|HTTPS *(REST + WS upgrade)*|REST API + WebSocket reactivo (CU-01)|
|`backend`|`postgres`|TCP/SQL|Consultas y mutaciones (CU-02..CU-12, CU-14)|
|`backend`|`redis`|TCP/RESP|Operaciones sobre Sorted Set (CU-01) y List (RS-07)|
|`backend`|Hyperliquid L1|WebSocket *(saliente)*|Suscripción a feeds de operaciones y precios|
|`backend`|Servicio Webhook|HTTPS POST *(saliente)*|Transmisión de notificaciones (CU-14)|

</div>

> Solo el contenedor `frontend` se expone al exterior; `postgres` y `redis` quedan en una red interna y no son accesibles desde el host. El usuario percibe un único punto de entrada que termina TLS y enruta hacia los servicios internos.

## Redes y volúmenes

<div align=center>

|Red|Conecta|Razón|
|-|-|-|
|*Red de borde*|`frontend` ↔ exterior|Red expuesta al host. Solo la usa el contenedor que termina TLS|
|*Red interna*|`backend` ↔ `postgres` ↔ `redis` ↔ `frontend`|Red privada para tráfico interno. La persistencia y la caché no se exponen al host|

</div>

<div align=center>

|Volumen|Contenedor|Función|RS|
|-|-|-|-|
|`fieldx-postgres-data`|`postgres`|Persistencia ACID del catálogo, las alertas y las notificaciones|RS-03, RS-09|
|`fieldx-redis-data`|`redis`|Persistencia AOF del Sorted Set del leaderboard y de la cola de reintentos|RS-03, RS-07|
|`fieldx-backend-logs`|`backend`|Logs estructurados rotados|RS-03|

</div>

> La separación en dos redes y la externalización del estado a volúmenes son las dos decisiones que materializan el RS-03 (24/7): tras un reinicio del host, los contenedores recuperan su estado y la disponibilidad del sistema no depende del proceso `backend` para los datos persistentes.

## Política de salud y reinicios

<div align=center>

|Aspecto|Decisión|RS|
|-|-|-|
|**Auto-reinicio**|Cada contenedor se relanza tras crash o reboot del host hasta intervención explícita del operador|RS-03|
|**Sondas de salud**|Cada servicio expone una sonda que el orquestador consulta periódicamente. El `backend` no arranca antes de que `postgres` y `redis` estén `healthy`|RS-03|
|**Endpoint de salud del `backend`**|Verifica conectividad con `postgres`, con `redis` y la última recepción del WS de Hyperliquid; pasa a *degraded* si Hyperliquid lleva más de un umbral configurado sin emitir|RS-03, RS-08|
|**Reconexión a Hyperliquid**|`HyperliquidConnector` reintenta con backoff exponencial; el resto del sistema continúa con el último estado conocido|RS-03, RS-08|

</div>

## Configuración externa

Todas las decisiones que pueden cambiar entre entornos (local, staging, Infinite Fieldx) se exponen como **variables de configuración externas al contenedor**. El esqueleto del diseño solo fija qué variables existen y qué función cumplen; los valores concretos los aporta cada despliegue.

<div align=center>

|Variable|Naturaleza|Función|RS|
|-|-|-|-|
|`POSTGRES_PASSWORD`|Secreto|Conexión `backend` ↔ `postgres`|RS-10|
|`APP_SECRET`|Secreto|Clave maestra para el cifrado simétrico de URLs de webhook (cf. [Modelo de datos](modeloDeDatos.md))|RS-10|
|`HYPERLIQUID_WS_URL`|Configuración|Endpoint del feed de Hyperliquid — punto de sustituibilidad RS-08|RS-08|
|`LOG_LEVEL`|Configuración|Verbosidad del logger|—|

</div>

## Sustituibilidad de la frontera (RS-08)

La sustitución del proveedor de Hyperliquid (API pública ↔ nodo no validador) se realiza **sin modificar el código del núcleo**:

<div align=center>

|Elemento que cambia|Mecanismo|
|-|-|
|Endpoint del feed|Variable de configuración (`HYPERLIQUID_WS_URL`)|
|Protocolo del feed *(si difiere)*|Una segunda implementación de `IHyperliquidPort` se inyecta en `IngestionModule`. La capa de aplicación y el dominio no cambian|

</div>

> El núcleo del sistema permanece intacto: el adaptador es el único componente que conoce el protocolo concreto. Esta es la materialización física del puerto identificado en el [Diseño de la arquitectura](disenoArquitectura.md).

## Validación del despliegue

<div align=center>

|Criterio|Comprobación|
|-|-|
|**Disponibilidad 24/7 (RS-03)**|Auto-reinicio + sondas de salud + estado persistente en volúmenes|
|**Sustituibilidad (RS-08)**|El proveedor Hyperliquid es una variable de configuración + un punto de inyección de adapter|
|**Confidencialidad (RS-10)**|Webhook cifrado en BD; secretos solo en el entorno del contenedor, nunca en el repositorio|
|**Reproducibilidad**|Un único nodo, contenedores estándar y configuración externalizada permiten levantar el sistema con un único comando de orquestación|
|**Escalabilidad limitada al alcance**|Un único nodo es suficiente para la fase de Elaboración. La descomposición lógica en módulos NestJS deja preparada una eventual descomposición en microservicios cuando algún RS lo exija|

</div>

## Trazabilidad

<div align=center>

|De|A|Mecanismo|
|-|-|-|
|[Diseño de la arquitectura](disenoArquitectura.md)|Esta especificación|Cada subsistema lógico se mapea a un proceso/contenedor|
|[Modelo de datos](modeloDeDatos.md)|Volúmenes `postgres` y `redis`|Persistencia de las tablas y estructuras descritas|
|RS-03, RS-08, RS-10|Auto-reinicio, sondas, configuración externalizada, cifrado|Cada decisión cita el RS|
|Capítulo 4|Ficheros de orquestación (`Dockerfile`, `docker-compose.yml`), scripts y procedimientos de despliegue|La implementación concreta del despliegue —el qué, el cómo y el cuándo de cada comando— se entrega en el Capítulo 4|

</div>
