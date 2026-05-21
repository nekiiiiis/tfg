# Diseño de los casos de uso

Refina las realizaciones del [análisis de los CdU](analisisCdU.md) sustituyendo cada rol de análisis por **clases de diseño** concretas y materializando los mensajes con la tecnología fijada en el [diseño de la arquitectura](disenoArquitectura.md). Se mantienen los cuatro CdU de riesgo desarrollados en detalle (CU-01, CU-09, CU-13, CU-14) y el patrón CRUD parametrizado para el resto.

## Convenciones

<div align=center>

|Estereotipo|Significado en este capítulo|
|-|-|
|`<<gateway>>`|Punto de entrada técnico (`*.routes.ts` para HTTP, `leaderboard.ws.ts` para WebSocket)|
|`<<service>>`|Servicio de aplicación; orquesta un CdU o un grupo cohesivo|
|`<<handler>>`|Función o ámbito léxico que reacciona a un evento del bus|
|`<<adapter>>`|Implementación concreta de un puerto hacia el exterior|
|`<<repo>>`|Acceso a la persistencia (Drizzle queries) dentro de un servicio|

</div>

> Las clases reseñadas en cada tabla apuntan a artefactos reales del repositorio. La trazabilidad código ↔ diseño se cierra en el [diseño de clases](disenoClases.md) y en el [diseño de paquetes](disenoPaquetes.md).

---

## Realización de CU-01 — Consultar leaderboard

### Participantes (refinamiento de la realización de análisis)

<div align=center>

|Rol de análisis|Clase de diseño|Estereotipo|Ubicación|
|-|-|-|-|
|`VistaLeaderboard`|`LeaderboardPage` + `LeaderboardTable` + `LeaderboardFilters` + `AppDataContext`|frontend|`web/src/pages/LeaderboardPage.tsx`, `web/src/features/leaderboard/*`, `web/src/core/AppDataContext.tsx`|
|—|`registerLeaderboardGateway` (WS)|`<<gateway>>`|`app/src/modules/leaderboard/leaderboard.ws.ts`|
|`GestorConsultaLeaderboard`|`LeaderboardService`|`<<service>>`|`app/src/modules/leaderboard/leaderboard.service.ts`|
|`LeaderboardEnVivo`|`LeaderboardState`|in-memory|`app/src/modules/leaderboard/leaderboard.state.ts`|
|—|`TradePersistence`|`<<service>>` + `<<repo>>` (sobre `lb_trades`)|`app/src/modules/leaderboard/trade-persistence.service.ts`|
|`ConectorHyperliquid`|`PublicWsAdapter`, implementación de `IHyperliquidSource`|`<<adapter>>`|`app/src/sources/public-ws.adapter.ts`|
|`GestorCatalogoEntidades` *(consulta)*|`CatalogoService.resolverDirecciones`|`<<service>>`|`app/src/modules/catalogo/catalogo.service.ts`|

</div>

### Flujo de diseño

1. El cliente abre la página `LeaderboardPage`. `AppDataContext` establece una única conexión WebSocket con el backend en `/ws/leaderboard` y envía un mensaje `subscribe` con `{ mercado, token, temporalidad }`.
2. `registerLeaderboardGateway` recibe la suscripción y delega en `LeaderboardService.subscribe(terna)`. Este último:
   - Resuelve el `displayToken` a `feedCoin` (identificador interno de Hyperliquid) usando `MetaService`.
   - Abre — o reutiliza — un canal de trades para el par mediante `IHyperliquidSource.subscribeTrades(feedCoin)`.
   - Siembra el snapshot inicial desde dos fuentes complementarias: (a) el buffer del canal en memoria, si lleva tiempo abierto; (b) la tabla `lb_trades` consultada por `TradePersistence.getHistorical`, para temporalidades largas (`1d`, `1w`).
   - Encola un *backfill* con `IHyperliquidSource.getRecentTrades` para reducir el hueco entre el snapshot y los trades en vivo.
3. Por cada trade que llega vía WS, `LeaderboardService`:
   - Lo deduplica por `tid`.
   - Lo encola en `TradePersistence` (flush periódico a `lb_trades`).
   - Lo agrega en `LeaderboardState` para todas las ternas activas del par.
   - Publica `LeaderboardActualizado` en el bus.
4. `registerLeaderboardGateway`, suscrito a `LeaderboardActualizado`, reenvía la actualización al cliente sobre la conexión WS existente.
5. `LeaderboardTable` consulta `POST /api/direcciones/resolver` (servido por `CatalogoService`) para resolver los nombres de las direcciones presentes y los pinta junto a la dirección abreviada.
6. Al cerrar la página, el cliente desconecta el WS. Si no quedan suscriptores para el par, el canal entra en *grace period*; tras él pasa al estado `keepAlive` para seguir alimentando `lb_trades` aunque ningún usuario lo esté viendo (RS-03).

### Decisiones de diseño

<div align=center>

|Decisión|Justificación|
|-|-|
|`LeaderboardState` in-memory en vez de almacenamiento externo|Una sola máquina, RS-01 (≤ 1 s), sin necesidad de compartir estado entre réplicas|
|`TradePersistence` con flush en batch (`500 ms` o `1000 ops`)|Independiza el ritmo del WS de Hyperliquid del ritmo de `INSERT` en Postgres|
|Polling REST `recentTrades` adaptativo|Red de seguridad ante huecos del WS; intervalo dinámico según frescura del WS y polls vacíos|
|Dedupe por `tid` además de `ts`|Los mismos trades pueden venir por WS y por REST; el `tid` da identidad estable|
|Resolución de nombres por HTTP desde el cliente|Mantiene a `LeaderboardService` independiente del modelo de catálogo; la resolución es un detalle de presentación|
|Pre-warm de canales por configuración (`LEADERBOARD_PREWARM`)|Permite que el server arranque ya alimentando `lb_trades` para los pares que vayan a usarse, sin esperar al primer suscriptor|

</div>

### Diagrama de secuencia

<div align=center>

![Secuencia de diseño CU-01](../../imagenes/capitulo3/diseno-secuencia-CU-01.svg)

</div>

---

## Realización de CU-09 — Crear alerta de precio

### Participantes

<div align=center>

|Rol de análisis|Clase de diseño|Estereotipo|Ubicación|
|-|-|-|-|
|`VistaAlertas`|`AlertasPage` + `AlertaForm`|frontend|`web/src/pages/AlertasPage.tsx`, `web/src/features/alertas/AlertaForm.tsx`|
|—|`registerAlertasRoutes` (`POST /api/alertas`)|`<<gateway>>`|`app/src/modules/alertas/alertas.routes.ts`|
|`GestorAlertasPrecio`|`AlertasService.crear`|`<<service>>` + `<<repo>>`|`app/src/modules/alertas/alertas.service.ts`|
|`ConectorWebhook`|`WebhookConnector.checkReachability`|`<<adapter>>`|`app/src/modules/notificacion/webhook.connector.ts`|
|`AlertaPrecio`|Tabla `alertas` (Drizzle schema)|—|`app/src/persistence/schema/alertas.ts`|
|`Webhook`|Cifrado `pgp_sym_encrypt`|—|`app/src/persistence/crypto.ts`|

</div>

### Flujo de diseño

1. El cliente envía `POST /api/alertas` con `{ mercado, token, umbral: { cruce, valor }, webhookUrl }`.
2. La ruta valida el cuerpo con Zod (mismo nivel que un DTO).
3. `AlertasService.crear` realiza:
   - Validación de invariantes del dominio (`umbral.valor > 0`, formato de URL).
   - `WebhookConnector.checkReachability` (HEAD o GET con timeout corto); el resultado se incluye en la respuesta como aviso, sin bloquear el alta.
   - Cifrado de la URL del webhook con `encryptWebhook` (`pgp_sym_encrypt`).
   - `INSERT` en la tabla `alertas` con estado `OPERATIVA`.
4. La ruta responde con la alerta creada (la URL del webhook se devuelve descifrada para conveniencia del cliente).

### Decisiones de diseño

<div align=center>

|Decisión|Justificación|
|-|-|
|Cifrado simétrico con `pgcrypto`|RS-10: la URL del webhook no queda en texto plano en BD; la clave maestra (`APP_SECRET`) vive en el proceso, no en filas|
|Validación de alcanzabilidad como aviso, no como precondición|Un webhook puede estar momentáneamente caído sin que ello impida el alta de la alerta; los reintentos (RS-07) cubren la entrega cuando suba|
|`AlertasService` accede a Drizzle directamente|Servicio fino; no hay valor añadido en interponer un `IAlertasRepository`|

</div>

### Diagrama de secuencia

<div align=center>

![Secuencia de diseño CU-09](../../imagenes/capitulo3/diseno-secuencia-CU-09.svg)

</div>

### Variaciones

- **CU-10 (Abrir alertas)**: `AlertasService.listar` con `pgp_sym_decrypt` integrado en la `SELECT` para devolver URLs ya en claro al cliente autorizado.
- **CU-11 (Editar alerta)**: `AlertasService.actualizar`, con re-verificación opcional del webhook si cambia la URL.
- **CU-12 (Eliminar alerta)**: `AlertasService.eliminar` con `DELETE` simple (las notificaciones asociadas mantienen el `alerta_id` por trazabilidad — la integridad referencial se modela `ON DELETE CASCADE`).

---

## Realización de CU-13 — Evaluar alertas activas

### Participantes

<div align=center>

|Rol de análisis|Clase de diseño|Estereotipo|Ubicación|
|-|-|-|-|
|`ConectorHyperliquid`|`PublicWsAdapter.subscribeAllMids`|`<<adapter>>`|`app/src/sources/public-ws.adapter.ts`|
|—|Traducción `midsKey → display token` y emisión de `PrecioActualizado` en el bus|—|`app/src/server.ts` (composition root)|
|`GestorEvaluacionAlertas`|`wireEvaluacion` (suscriptor `<<handler>>`)|`<<handler>>`|`app/src/modules/evaluacion/evaluacion.subscriber.ts`|
|—|`evaluarAlertasContraPrecio` (función pura)|—|`app/src/modules/evaluacion/evaluator.ts`|
|`GestorAlertasPrecio` *(consulta)*|`SELECT ... WHERE estado='OPERATIVA' AND token_simbolo=?`|`<<repo>>`|*(inline en `evaluacion.subscriber.ts`)*|
|`GestorEnvioNotificacion`|`NotificacionService.dispararParaAlerta`|`<<service>>`|`app/src/modules/notificacion/notificacion.service.ts`|

</div>

### Flujo de diseño

1. `PublicWsAdapter` recibe del WS un objeto `allMids` con los precios mid actuales de **todos** los activos listados.
2. El composition root (`server.ts`) compara con la última lectura conocida, traduce cada `midsKey` al `displayToken` usando `MetaService.getMidsKeyToDisplay()` y, para cada precio que ha cambiado, publica `PrecioActualizado` en el bus con el token en formato display.
3. `wireEvaluacion`, suscrito a `PrecioActualizado`, recupera las alertas operativas para ese token con una consulta indexada (`alertas_token_estado`).
4. `evaluarAlertasContraPrecio` aplica el predicado `evaluarUmbral` (definido en el dominio, `domain/types.ts`) a cada alerta y devuelve los identificadores disparados.
5. Para cada alerta disparada:
   - `UPDATE alertas SET estado='DISPARADA', ultimo_disparo=now() WHERE id=...`.
   - `bus.emit('AlertaDisparada', ...)` para los suscriptores observables (logging, métricas).
   - Llamada directa a `NotificacionService.dispararParaAlerta(alertaId, precio)` para realizar CU-14.

### Decisiones de diseño

<div align=center>

|Decisión|Justificación|
|-|-|
|Predicado del umbral como función pura en dominio|Reutilizable desde la evaluación y desde tests; no acopla la evaluación a la persistencia|
|Consulta indexada por `(token_simbolo, estado)`|RS-02: hasta miles de alertas operativas se filtran en `O(log n)` para el token afectado|
|Llamada directa a CU-14 en lugar de pasar por bus|La relación `<<include>>` identificada en la captura de casos de uso es síncrona en intención; la llamada directa es más simple y mantiene un trazado claro|
|Procesamiento por evento en el event loop (no por batch)|Cada precio se procesa en su propia activación; múltiples precios concurrentes no se serializan en un mismo callback|

</div>

### Diagrama de secuencia

<div align=center>

![Secuencia de diseño CU-13](../../imagenes/capitulo3/diseno-secuencia-CU-13.svg)

</div>

---

## Realización de CU-14 — Enviar notificación

### Participantes

<div align=center>

|Rol de análisis|Clase de diseño|Estereotipo|Ubicación|
|-|-|-|-|
|`GestorEnvioNotificacion`|`NotificacionService`|`<<service>>` + `<<repo>>` (sobre `notificaciones`)|`app/src/modules/notificacion/notificacion.service.ts`|
|`ConectorWebhook`|`WebhookConnector.transmit`|`<<adapter>>`|`app/src/modules/notificacion/webhook.connector.ts`|
|—|`startRetryWorker` (worker periódico)|`<<service>>`|`app/src/modules/notificacion/retry.worker.ts`|
|`Notificacion`|Tabla `notificaciones` (Drizzle schema)|—|`app/src/persistence/schema/notificaciones.ts`|

</div>

### Flujo de diseño

1. `NotificacionService.dispararParaAlerta(alertaId, precio)`:
   - `INSERT` en `notificaciones` con `estado='PENDIENTE'`, `precio_disparador`, `instante_emision=now()`, `intento=1`, `proximo_intento=now()`.
   - Llama a `transmitirYActualizar(notificacionId)` en background (no bloquea el evaluador).
2. `transmitirYActualizar`:
   - `SELECT` con `pgp_sym_decrypt(webhook_url_enc, APP_SECRET)` para recuperar la URL en claro.
   - `WebhookConnector.transmit(url, payload)` con timeout de 10 s.
   - **Éxito**: `UPDATE notificaciones SET estado='ENTREGADA', entregada_en=now()` y `UPDATE alertas SET estado='OPERATIVA'`; emite `NotificacionConfirmada` al bus.
   - **Fallo**: calcula `proximo_intento` con la política de backoff acumulado; `UPDATE notificaciones SET estado='FALLIDA' (transitorio), intento=intento+1, proximo_intento=...`; `UPDATE alertas SET estado='NOTIFICACION_FALLIDA'`; emite `NotificacionFallida`.
3. `startRetryWorker`, tickeando cada `NOTIFICATION_RETRY_TICK_SECONDS`:
   - `SELECT ... WHERE estado IN ('PENDIENTE','FALLIDA') AND proximo_intento <= now()` (usando el índice `notif_pendientes_proximas`).
   - Llama a `transmitirYActualizar` para cada fila.
4. Cuando el `intento` supera el máximo configurado, la notificación queda en `FALLIDA` permanente y el worker la deja de tomar (manteniéndose como registro auditable, RS-09).

### Decisiones de diseño

<div align=center>

|Decisión|Justificación|
|-|-|
|Cola virtual sobre `notificaciones` en lugar de cola externa|Una sola dependencia de infraestructura (Postgres); persistencia ACID; sin riesgo de divergencia entre cola y BD|
|Backoff acumulado configurable|Política operativa por entorno sin tocar código (RS-07)|
|`UPDATE alertas` desde el flujo de notificación|La alerta es la fuente de verdad del estado funcional; la notificación es el detalle de entrega|
|Llamada en background tras `INSERT`|La evaluación (CU-13) no se bloquea esperando al webhook; el reintento garantiza eventualmente la entrega|

</div>

### Diagrama de secuencia

<div align=center>

![Secuencia de diseño CU-14](../../imagenes/capitulo3/diseno-secuencia-CU-14.svg)

</div>

---

## Patrón CRUD — CU-02..CU-08 y CU-10..CU-12

Estos once CdU comparten estructura de diseño. Se documenta el patrón una sola vez y se materializa en `*.routes.ts` + `*.service.ts` por subsistema.

### Estructura genérica

<div align=center>

|Capa|Artefacto|Responsabilidad|
|-|-|-|
|Frontend|`*Page` + `*Form`|Vista, formulario y *call site* hacia el API|
|API|`*.routes.ts`|Validación Zod, mapeo de errores de dominio a HTTP|
|Aplicación|`*Service.<verbo>`|Validación de invariantes, persistencia, emisión opcional de eventos|
|Persistencia|Tabla Drizzle|Almacenamiento durable con índices y constraints|

</div>

### Verbos y tabla por CdU

<div align=center>

|CdU|Endpoint|Servicio|Tabla|
|-|-|-|-|
|**CU-02** Crear entidad|`POST /api/entidades`|`CatalogoService.crearEntidad`|`entidades`|
|**CU-03** Abrir entidades|`GET /api/entidades`|`CatalogoService.listarEntidades`|`entidades`|
|**CU-04** Editar entidad|`PATCH /api/entidades/:id`|`CatalogoService.renombrarEntidad`|`entidades`|
|**CU-05** Eliminar entidad|`DELETE /api/entidades/:id`|`CatalogoService.eliminarEntidad`|`entidades` + cascada en `direcciones`|
|**CU-06** Añadir dirección|`POST /api/entidades/:id/direcciones`|`CatalogoService.aniadirDireccion`|`direcciones`|
|**CU-07** Abrir direcciones|`GET /api/entidades/:id/direcciones`|`CatalogoService.listarDirecciones`|`direcciones`|
|**CU-07** *(detalle global)*|`GET /api/direcciones/:addr/{spot,perps,staking,fills}`|`AddressDetailService.*`|—|
|**CU-08** Eliminar dirección|`DELETE /api/direcciones/:id`|`CatalogoService.eliminarDireccion`|`direcciones`|
|**CU-10** Abrir alertas|`GET /api/alertas`|`AlertasService.listar`|`alertas`|
|**CU-11** Editar alerta|`PATCH /api/alertas/:id`|`AlertasService.actualizar`|`alertas`|
|**CU-12** Eliminar alerta|`DELETE /api/alertas/:id`|`AlertasService.eliminar`|`alertas` + cascada en `notificaciones`|

</div>

### Flujo genérico

1. El cliente invoca el endpoint REST con cuerpo o parámetros.
2. La ruta valida el cuerpo con Zod; en caso de error 400 con mensaje detallado.
3. El servicio realiza la operación: para creaciones y ediciones, valida invariantes (unicidad, formato, existencia previa); para bajas, valida precondiciones (existencia, posibilidad de cascada).
4. Drizzle persiste la mutación o devuelve la consulta; los errores de dominio (`EntidadNoEncontrada`, `AlertaNoEncontrada`, etc.) se mapean a códigos HTTP en el filtro global de errores.
5. La ruta responde con el recurso o con un mensaje de confirmación.

### Variación del CU-07 — Detalle global de una dirección

La extensión funcional de CU-07 (vista integral con saldos perpetuos, saldos spot, resumen de staking y últimas operaciones) sigue el mismo patrón con dos particularidades:

- El servicio (`AddressDetailService`) no accede a Postgres: delega en `IHyperliquidSource` para las cuatro consultas y enriquece la respuesta con metadatos del catálogo (`MetaService`).
- No introduce mutación: es puramente consulta, por lo que no afecta a la tabla `direcciones`.

### Diagrama de secuencia parametrizado

<div align=center>

![Secuencia de diseño CRUD](../../imagenes/capitulo3/diseno-secuencia-CRUD.svg)

</div>
