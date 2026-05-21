# Diseño de la arquitectura

Concreta el esqueleto del [análisis de la arquitectura](analisisArquitectura.md) en una arquitectura técnica que satisface los requisitos suplementarios. Cada decisión se justifica como respuesta a un RS-XX y queda trazada al artefacto del repositorio que la materializa.

## Estilo arquitectónico

El sistema adopta una **arquitectura en capas** con un **puerto hexagonal** en la única frontera técnicamente compleja: la integración con Hyperliquid L1. Esta combinación da, sin sobrecoste de framework, la separación de responsabilidades, la testabilidad y la sustituibilidad que los requisitos suplementarios demandan.

### Capas

<div align=center>

|Capa|Responsabilidad|Conoce|Es conocida por|
|-|-|-|-|
|**Dominio**|Tipos del dominio, contratos de eventos, errores de negocio. Pura; sin dependencias externas.|—|Aplicación, presentación, infraestructura|
|**Aplicación**|Servicios que coordinan los CdU; uno por subsistema del análisis. Orquesta dominio + infraestructura.|Dominio|Presentación, composition root|
|**Infraestructura**|Adaptadores hacia el exterior (Hyperliquid, webhook), persistencia (PostgreSQL vía Drizzle) y mecanismos transversales (bus, logger).|Dominio (a través de tipos y eventos), aplicación (a través de interfaces)|Composition root|
|**Presentación**|Gateways HTTP y WebSocket de Fastify, frontend React.|Aplicación (vía servicios inyectados), dominio (tipos para DTOs)|—|

</div>

La dirección de las dependencias respeta el principio de inversión: el dominio no conoce a nadie; la infraestructura conoce al dominio, no al revés.

### Puerto hexagonal: la frontera con Hyperliquid

`IHyperliquidSource` (`app/src/sources/hyperliquid.port.ts`) define el contrato de salida hacia la L1: suscripción al flujo de trades, al canal `allMids`, consultas REST puntuales (`recentTrades`, saldos, fills, staking). El núcleo del sistema (servicios de aplicación, dominio) depende únicamente de esta interfaz, no de protocolos.

Sobre ese puerto conviven dos adaptadores intercambiables:

<div align=center>

|Adaptador|Estado|Mecanismo|Selección|
|-|-|-|-|
|`PublicWsAdapter`|Activo|WebSocket público `wss://api.hyperliquid.xyz/ws` + REST `/info`|`HYPERLIQUID_SOURCE=public-ws`|
|`NanorethRpcAdapter`|Esqueleto (no funcional)|JSON-RPC contra un nodo no validador local|`HYPERLIQUID_SOURCE=nanoreth`|

</div>

La elección se realiza por configuración en `createHyperliquidSource()` (`app/src/sources/index.ts`). Materializa **RS-08** (sustituibilidad de la fuente de datos) sin que ningún otro punto del sistema necesite enterarse del cambio.

### Vista de capas

<div align=center>

![Vista de capas](../../imagenes/capitulo3/diseno-capas.svg)

</div>

## Selección tecnológica

Cada decisión técnica responde a uno o varios requisitos suplementarios.

### Runtime y lenguaje

<div align=center>

|Elemento|Decisión|Justificación|
|-|-|-|
|Lenguaje|TypeScript estricto|Tipos compartidos entre back y front; detección temprana de errores; coste de mantenimiento bajo|
|Runtime|Node.js 20 LTS|Soporte WebSocket nativo, ecosistema maduro, modelo asíncrono basado en `EventEmitter` directamente reutilizable|

</div>

### Framework HTTP/WS

<div align=center>

|Elemento|Decisión|Justificación|RS|
|-|-|-|-|
|Framework|**Fastify 5** con `@fastify/cors`, `@fastify/websocket`, `@fastify/static`|Sobrecarga mínima sobre `http` nativo, throughput alto y validación nativa por esquema; encaja con un servidor que mantiene en una misma instancia rutas REST, gateway WebSocket y SPA estático|RS-01, RS-02|
|Validación de entrada|**Zod** en cada ruta|Esquemas explícitos; mensajes de error coherentes; tipos derivados del esquema|—|
|Manejo de errores|Filtro global de Fastify que mapea errores de dominio a HTTP|Mantiene el dominio agnóstico al protocolo|RS-05|

</div>

### Persistencia transaccional

<div align=center>

|Elemento|Decisión|Justificación|RS|
|-|-|-|-|
|RDBMS|**PostgreSQL 16**|Garantías ACID, índices BTREE, `enum`, `pgcrypto`|RS-03, RS-09, RS-10|
|ORM|**Drizzle ORM + Drizzle Kit**|SQL-first; tipos derivados del esquema; migraciones explícitas; peso mínimo en arranque|—|
|Cifrado de webhooks|`pgp_sym_encrypt` / `pgp_sym_decrypt` (`pgcrypto`) con clave maestra `APP_SECRET`|La clave vive en el proceso de la aplicación; el cifrado se delega a la base de datos|RS-10|

### Estado caliente y reactividad

El análisis ya identificó `LeaderboardEnVivo` como entidad **derivada** (reconstruible a partir del flujo). El diseño concreta la decisión:

<div align=center>

|Elemento|Decisión|Justificación|RS|
|-|-|-|-|
|`LeaderboardEnVivo`|Estructura **in-memory** en el proceso de aplicación (`LeaderboardState`)|Una sola máquina, sin necesidad de compartir estado entre réplicas; cada terna soporta `O(1)` por trade y `O(n log n)` por snapshot|RS-01, RS-02|
|Persistencia auxiliar de trades|Tabla `lb_trades` en PostgreSQL alimentada en batch|Cubre ventanas largas (`1d`, `1w`) que no caben en memoria y soporta recuperación tras reinicio sin perder cobertura|RS-03|
|Bus de eventos|`EventEmitter` nativo de Node envuelto en un tipo `TypedBus<DomainEventMap>` (`app/src/bus.ts`)|Tipado estático sobre eventos del dominio; cero dependencias adicionales|—|
|Política `at-most-once`|Aceptada para eventos del flujo continuo|Las operaciones y los precios llegan continuamente; un evento perdido se recupera con el siguiente|RS-03|

</div>

### Cola de reintentos

<div align=center>

|Elemento|Decisión|Justificación|RS|
|-|-|-|-|
|Backing store|Columna `notificaciones.proximo_intento` con índice `(estado, proximo_intento)`|Cola virtual con persistencia ACID; sin servicios adicionales (cero dependencias de infraestructura extra)|RS-07, RS-09|
|Worker|`RetryWorker` periódico (`app/src/modules/notificacion/retry.worker.ts`)|Tick configurable (`NOTIFICATION_RETRY_TICK_SECONDS`) que toma las notificaciones cuyo próximo intento ya venció y reintenta|RS-07|
|Política de backoff|Lista de delays acumulados configurable (`NOTIFICATION_RETRY_BACKOFF_SECONDS`)|`1, 5, 30, 300, 1800, 3600` segundos por defecto; ajustable sin tocar código|RS-07|

</div>

### Frontend

<div align=center>

|Elemento|Decisión|Justificación|RS|
|-|-|-|-|
|Build|Vite|Build sub-segundo, soporte nativo de TypeScript y JSX|—|
|UI|React 19 + Tailwind 4 + shadcn/ui|Tema dark profesional sin frameworks pesados; componentes accesibles|RS-05|
|Estado de servidor|`@tanstack/react-query` para REST + WebSocket dedicado para el leaderboard|Encaja con el modelo *snapshot + actualizaciones incrementales* del CU-01|RS-01|
|Gráfico de precios|TradingView `lightweight-charts` consumiendo Hyperliquid directamente|Decisión documentada como soporte visual del CU-01; no introduce CdU nuevo|—|

</div>

## Asignación de subsistemas a módulos

Los subsistemas del análisis se materializan como **módulos del código**, organizados por feature (no por capa) para concentrar todo lo necesario de un CdU en un único directorio:

<div align=center>

|Subsistema|Módulo del código|Capa principal|
|-|-|-|
|S-PRES (back)|`app/src/modules/*/*.routes.ts`, `app/src/modules/leaderboard/leaderboard.ws.ts`|Presentación|
|S-PRES (front)|`web/src/pages/`, `web/src/features/`|Presentación|
|S-INGE|`app/src/sources/` *(adaptadores)* + parte del composition root en `server.ts` *(traducción de `allMids` a `PrecioActualizado`)*|Infraestructura|
|S-LEAD|`app/src/modules/leaderboard/`|Aplicación + estado|
|S-CATA|`app/src/modules/catalogo/`, `app/src/modules/meta/`|Aplicación|
|S-ALER|`app/src/modules/alertas/`|Aplicación|
|S-EVAL|`app/src/modules/evaluacion/`|Aplicación|
|S-NOTI|`app/src/modules/notificacion/`|Aplicación + infraestructura (`WebhookConnector`)|

</div>

> El detalle de la estructura de directorios — qué archivo concreto vive en cada módulo — se desarrolla en el [diseño de paquetes](disenoPaquetes.md).

<div align=center>

![Mapa de módulos del backend](../../imagenes/capitulo3/diseno-modulos.svg)

</div>

## Mecanismos de comunicación

### Entre el cliente y el sistema

<div align=center>

|Mecanismo|Uso|Justificación|
|-|-|-|
|HTTP REST (Fastify)|CRUD de entidades, direcciones, alertas; consultas puntuales|Idempotencia y trazabilidad de cada operación|
|WebSocket (Fastify)|Leaderboard reactivo (CU-01)|Empuje desde el servidor sin polling; coste de conexión amortizado durante toda la sesión|

</div>

El frontend usa **una única conexión WS** al backend para el leaderboard y la franja superior de precios (`PriceTicker`), gestionada centralmente por `AppDataContext` (`web/src/core/AppDataContext.tsx`).

### Entre subsistemas dentro del proceso

Bus de eventos tipado (`app/src/bus.ts`). Productores y consumidores se ignoran mutuamente; el bus media la comunicación.

<div align=center>

|Evento|Productor|Consumidor(es)|
|-|-|-|
|`OperacionRecibida`|`PublicWsAdapter` *(vía `LeaderboardService`)*|`LeaderboardService` *(agrega a `LeaderboardState`)*|
|`PrecioActualizado`|Composition root *(traducción de `allMids`)*|`wireEvaluacion` *(evaluador de alertas)*|
|`LeaderboardActualizado`|`LeaderboardService`|`LeaderboardGateway` *(reenvía al cliente)*|
|`AlertaDisparada`|`wireEvaluacion`|`NotificacionService` *(directo)*; logging|
|`NotificacionConfirmada`|`NotificacionService`|Logging / observabilidad|
|`NotificacionFallida`|`NotificacionService`|Logging / observabilidad|

</div>

Los eventos llevan en el payload únicamente identificadores y datos del dominio (sin DTOs HTTP, sin filas de BD), lo que aísla a los suscriptores de detalles de capa.

<div align=center>

![Bus de eventos del dominio](../../imagenes/capitulo3/diseno-eventos.svg)

</div>

### Con el exterior

<div align=center>

|Frontera|Protocolo|Adaptador|
|-|-|-|
|Hyperliquid L1 — flujo continuo|WebSocket público `wss://api.hyperliquid.xyz/ws`|`PublicWsAdapter`|
|Hyperliquid L1 — consultas puntuales|REST `POST /info`|`PublicWsAdapter` *(reutilizando el mismo cliente)*|
|Servicio Webhook|HTTP POST con cuerpo JSON; timeout de 10 s|`WebhookConnector`|

</div>

## Trazabilidad de los requisitos suplementarios

<div align=center>

|Requisito|Decisión arquitectónica|Verificable en|
|-|-|-|
|**RS-01** ≤ 1 s en leaderboard|Pipeline directo `PublicWsAdapter → LeaderboardService → LeaderboardState → WS` sin pasar por BD|`leaderboard.service.ts`, `leaderboard.ws.ts`|
|**RS-02** ≤ 2 s en evaluación|Suscripción a `PrecioActualizado` + índice `(token, estado)` en `alertas`|`evaluacion.subscriber.ts`, migración `0000_init.sql`|
|**RS-03** 24/7|Proceso Node único + Postgres durable; estado caliente reconstruible|Configuración Docker Compose|
|**RS-04** Extensibilidad|Nuevos consumidores se suscriben al bus; nuevos tipos de alerta implementan una función de evaluación|`bus.ts`, `evaluator.ts`|
|**RS-05** Áreas independientes|Frontend con tres rutas independientes; backend con módulos sin dependencia cruzada salvo a través del bus|`web/src/App.tsx`|
|**RS-06** Mercados distinguidos|`Mercado` como tipo de primer orden; índices y validaciones lo incluyen|`domain/types.ts`, schemas Drizzle|
|**RS-07** Reintentos|`RetryWorker` + columna `proximo_intento`|`retry.worker.ts`|
|**RS-08** Sustituibilidad de la fuente|Puerto `IHyperliquidSource` + adaptadores|`sources/`|
|**RS-09** Trazabilidad|Tabla `notificaciones` con `alerta_id`, `precio_disparador`, `instante_emision`|`schema/notificaciones.ts`|
|**RS-10** Seguridad del webhook|`pgcrypto` + `APP_SECRET`|`persistence/crypto.ts`, `schema/alertas.ts`|

</div>

## Vista de despliegue

Detallada en el [documento de despliegue](despliegue.md). En resumen, dos servicios sobre Docker Compose:

- `app`: contenedor con el backend Fastify y el SPA compilado servido desde `/public`.
- `postgres`: PostgreSQL 16 con extensión `pgcrypto`.

Esta topología minimiza la superficie operativa (RS-03) sin sacrificar las garantías que los requisitos exigen.

## Cambios respecto al análisis

El [análisis de la arquitectura](analisisArquitectura.md) identificó siete subsistemas y cuatro mecanismos transversales. El diseño los mantiene íntegramente y añade:

<div align=center>

|Adición de diseño|Subsistema impactado|Razón|
|-|-|-|
|Puerto explícito `IHyperliquidSource`|S-INGE|Materializa RS-08 con una interfaz formal|
|Tabla `lb_trades` para histórico de trades|S-LEAD|Permite ventanas largas (`1d`, `1w`) sin saturar la memoria|
|`MetaService` (catálogo de Hyperliquid)|S-CATA *(extendido)*|Resolución `display token ↔ feedCoin ↔ midsKey`; necesaria porque la L1 usa identificadores distintos al display del usuario|
|`AddressDetailService` (flujo alternativo de CU-07)|S-CATA|Soporta la vista de detalle global de una dirección descrita en el detalle de CU-07|
|`TradePersistence` con flush en batch|S-LEAD|Independiza el ritmo del WS de Hyperliquid del ritmo de INSERT en Postgres|

</div>

Ninguna adición introduce un caso de uso nuevo: todas son refinamientos de los CdU ya existentes.
