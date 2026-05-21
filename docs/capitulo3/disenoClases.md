# Diseño de clases

Refina cada clase del [análisis de clases](analisisClases.md) en una o varias **clases de diseño** con responsabilidades, firmas y dependencias concretas. Las firmas se documentan sin cuerpos: la implementación se construye sobre estas clases en la disciplina posterior.

## Convenciones

<div align=center>

|Aspecto|Convención|
|-|-|
|Nomenclatura|Servicios de aplicación: `XxxService`. Adaptadores externos: `XxxAdapter` (puerto HL) o `XxxConnector` (webhook). Gateways HTTP: función `register*Routes`. Gateway WS: función `register*Gateway`. Eventos: nombres en pasado (`AlertaDisparada`, `PrecioActualizado`).|
|Estereotipos técnicos|`<<service>>`, `<<adapter>>`, `<<gateway>>`, `<<handler>>`, `<<repo>>` (acceso Drizzle integrado en servicios), `<<port>>` (interfaz)|
|Estilo|TypeScript estricto. Las interfaces de puerto son tipos en TS, no clases. Los DTOs se materializan como esquemas Zod con `infer` para los tipos.|
|Inyección de dependencias|Por constructor. Sin contenedor de IoC: el composition root (`server.ts`) realiza el cableado manual.|

</div>

## Capa de dominio

La capa de dominio agrupa los tipos, eventos y errores sin dependencias externas. Materializa el modelo del dominio del sistema.

<div align=center>

|Clase / tipo|Naturaleza|Responsabilidad|
|-|-|-|
|`Mercado`, `Token`, `Direccion`, `Operacion`, `Precio`|Tipos del dominio|Reflejan el MdD; sin métodos|
|`Terna`|Value object|Combinación `(mercado, token, temporalidad)` que identifica una vista del leaderboard|
|`Umbral`|Value object|`{ cruce, valor }`; función pura `evaluarUmbral(umbral, precio): boolean` aplicada por la evaluación|
|`AlertaPrecio`|Tipo del dominio|Atributos + estado del ciclo de vida (`OPERATIVA`, `DISPARADA`, `NOTIFICACION_FALLIDA`)|
|`Notificacion`|Tipo del dominio|Atributos + estado del ciclo de entrega (`PENDIENTE`, `ENTREGADA`, `FALLIDA`)|
|`DomainEventMap`|Tipo|Mapa nombre→payload de los seis eventos del dominio|
|`DomainError`|Clase base|Errores con `code` y `status` HTTP; especializaciones: `EntidadNoEncontrada`, `AlertaNoEncontrada`, `WebhookInvalido`, etc.|
|`esAddressValida(s)`|Función pura|Validación de formato `0x[a-f0-9]{40}`|
|`esTokenValido(s)`|Función pura|Validación de las tres formas: perp (`BTC.p`), spot (`HYPE/USDC`), HIP-3 (`dex:SYMBOL`)|

</div>

## Capa de aplicación (servicios)

Un servicio por subsistema del análisis. Cada uno depende de tipos del dominio y, opcionalmente, de adaptadores hacia el exterior.

### S-LEAD — `LeaderboardService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>`|
|Constructor|`(source: IHyperliquidSource, meta: MetaService, windowSeconds, maxOpsPerTerna, policy, persistence?: TradePersistence)`|
|Estado|`channels: Map<string, TokenChannel>`, `ternasRefcount`, `state: LeaderboardState`|
|Operaciones públicas|`subscribe(terna, opts): { snapshot, unsubscribe }`, `snapshot(terna, topN, lado)`, `close()`|
|Responsabilidades|Apertura/cierre de canales por par; ingestión WS + polling REST adaptativo con dedupe por `tid`; emisión de `LeaderboardActualizado`|

</div>

### S-LEAD — `LeaderboardState`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|*(estructura de aplicación)*|
|Constructor|`(windowSecondsByTemp, maxOps)`|
|Operaciones|`ingest(terna, op)`, `ingestBackfill(terna, ops[])`, `snapshot(terna, topN, lado)`, `ensureTerna(terna)`|
|Garantías|Mantiene una ventana deslizante por terna con cap de operaciones; `O(1)` por trade, `O(k log k)` por snapshot (`k`= direcciones)|

</div>

### S-LEAD — `TradePersistence`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>` + `<<repo>>`|
|Constructor|`(sql, opts?: { flushBatchSize, flushIntervalMs, retentionDays, cleanupIntervalMs, enabled })`|
|Operaciones|`enqueue(op)`, `enqueueMany(ops)`, `flush()`, `getHistorical(mercado, token, sinceMs, untilMs?)`, `cleanup()`, `start()`, `stop()`|
|Responsabilidades|Buffer en memoria, flush a `lb_trades` con `ON CONFLICT (tid) DO NOTHING`, cleanup periódico de trades por encima de la retención|

</div>

### S-CATA — `MetaService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>`|
|Constructor|`(opts: { infoUrl, ttlMs?, minIntervalMs?, refreshCooldownMs?, maxRetries? })`|
|Estado|Catálogo cacheado (`tokens`, `dexs`, índices por `id`, `feedCoin` y `midsKey`)|
|Operaciones|`getCatalog()`, `refresh()`, `listTokens(mercado?)`, `resolveToken(mercado, displayToken)`, `resolveByFeedCoin(feedCoin)`, `resolveByMidsKey(midsKey)`, `getMidsKeyToDisplay()`, `getCandles(...)`, `getTopVolume(...)`|
|Responsabilidades|Resolver identificadores entre display, feed y mids; cachear el catálogo con TTL y cooldown; obtener velas y top de volumen|

</div>

### S-CATA — `CatalogoService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>` + `<<repo>>`|
|Constructor|`(db: DB)`|
|Operaciones|`crearEntidad(nombre)`, `listarEntidades(filtro?)`, `renombrarEntidad(id, nombre)`, `eliminarEntidad(id)`, `aniadirDireccion(entidadId, valor)`, `listarDirecciones(entidadId)`, `eliminarDireccion(direccionId)`, `resolverDirecciones(addrs[])`|
|Responsabilidades|CRUD de `entidades` y `direcciones`; resolución por lote para el leaderboard|

</div>

### S-CATA — `AddressDetailService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>`|
|Constructor|`(source: IHyperliquidSource, meta: MetaService, getMid: (midsKey: string) => number \| undefined)`|
|Operaciones|`getSpot(address)`, `getPerps(address)`, `getStaking(address)`, `getFills(address)`|
|Responsabilidades|Recuperar las cuatro vistas del detalle global de una dirección desde HL y enriquecerlas con metadatos|

</div>

### S-ALER — `AlertasService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>` + `<<repo>>`|
|Constructor|`(db: DB, webhook: WebhookConnector)`|
|Operaciones|`crear(input)`, `listar(filtro?)`, `actualizar(id, cambios)`, `eliminar(id)`, `recuperarOperativasPorToken(token)`, `marcarComoDisparada(id)`|
|Responsabilidades|CRUD de `alertas`; cifrado/descifrado de la URL del webhook con `pgcrypto`; consulta indexada por `(token_simbolo, estado)` para CU-13|

</div>

### S-EVAL — `wireEvaluacion` y `evaluarAlertasContraPrecio`

<div align=center>

|Artefacto|Naturaleza|Responsabilidad|
|-|-|-|
|`wireEvaluacion(db, notificaciones)`|Función `<<handler>>`|Suscriptor del bus para `PrecioActualizado`. Recupera alertas operativas, llama al evaluador, actualiza estado y delega CU-14|
|`evaluarAlertasContraPrecio(alertas, precio)`|Función pura|Aplica `evaluarUmbral` (dominio) a cada alerta; devuelve los IDs disparados|

</div>

> El análisis identificó `GestorEvaluacionAlertas` como **clase de control**. En diseño se materializa como una **función de cableado** + una **función de predicado puro**. El refinamiento es coherente con SRP y con la naturaleza reactiva del CdU (no hay estado mutable propio del evaluador).

### S-NOTI — `NotificacionService`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<service>>` + `<<repo>>`|
|Constructor|`(db: DB, webhook: WebhookConnector)`|
|Operaciones|`dispararParaAlerta(alertaId, precio)`, `transmitirYActualizar(notificacionId)`, `listarPorAlerta(alertaId)`|
|Responsabilidades|Crear filas en `notificaciones`, descifrar la URL al transmitir, actualizar estados de notificación y de alerta, calcular `proximo_intento` con la política de backoff|

</div>

### S-NOTI — `WebhookConnector`

<div align=center>

|Atributo|Tipo / valor|
|-|-|
|Estereotipo|`<<adapter>>`|
|Constructor|`()` (sin estado relevante)|
|Operaciones|`checkReachability(url): Promise<boolean>`, `transmit(url, payload): Promise<void>` *(throws en fallo)*|
|Responsabilidades|HTTP cliente con timeout corto; abstrae a `NotificacionService` y a `AlertasService` de la complejidad del protocolo|

</div>

### S-NOTI — `startRetryWorker`

<div align=center>

|Artefacto|Naturaleza|Responsabilidad|
|-|-|-|
|`startRetryWorker(db, notificaciones)`|Función|Tick periódico que invoca `NotificacionService.transmitirYActualizar` para cada notificación con `proximo_intento <= now()`|

</div>

## Capa de infraestructura (adaptadores y persistencia)

### Puerto `IHyperliquidSource`

<div align=center>

|Aspecto|Detalle|
|-|-|
|Estereotipo|`<<port>>`|
|Definición|Tipo TS con métodos: `subscribeTrades(feedCoin, onTrade)`, `subscribeAllMids(onAllMids)`, `getRecentTrades(feedCoin)`, `getSpotState(address)`, `getPerpState(address)`, `getDelegations(address)`, `getUserFills(address)`, `lastTradeAt(feedCoin)`, `close()`|
|Implementaciones|`PublicWsAdapter`, `NanorethRpcAdapter`|
|Selección|`createHyperliquidSource()` lee `HYPERLIQUID_SOURCE` y devuelve la implementación adecuada|

</div>

### `PublicWsAdapter`

<div align=center>

|Aspecto|Detalle|
|-|-|
|Estereotipo|`<<adapter>>`|
|Constructor|`(opts: { wsUrl, infoUrl, feedStaleSeconds, infoMinIntervalMs, tradesInfoMinIntervalMs })`|
|Responsabilidades|Reconexión automática, multiplexado de canales sobre una única conexión WS, token bucket sobre `POST /info`, mapeo de mensajes crudos a `Operacion` y `Precio` del dominio|

</div>

### `NanorethRpcAdapter`

Esqueleto que implementa la misma interfaz pero lanza error en cada operación. Existe para validar la sustituibilidad del puerto (RS-08); su implementación funcional queda fuera del alcance del MVP.

### Cliente de base de datos

<div align=center>

|Artefacto|Naturaleza|Responsabilidad|
|-|-|-|
|`sql`|Cliente `postgres-js`|Conexión gestionada (pool de 10, `onnotice` enrutado al logger)|
|`db`|Handle Drizzle|Acceso tipado a los esquemas|
|`encryptWebhook(url)` / `decryptWebhookSelect(...)`|Helpers|Cifrado/descifrado con `pgp_sym_encrypt`/`pgp_sym_decrypt`|

</div>

### Bus de eventos

<div align=center>

|Artefacto|Naturaleza|Responsabilidad|
|-|-|-|
|`TypedBus<DomainEventMap>`|Clase|Wrapper tipado sobre `EventEmitter` con `emit(name, payload)` y `on(name, listener)` restringidos al `DomainEventMap`|
|`bus`|Singleton|Instancia única usada por todos los productores y consumidores|

</div>

## Capa de presentación

### Gateways HTTP

Un módulo `*.routes.ts` por subsistema, con validación Zod y mapeo de errores de dominio a HTTP en el filtro global (`shared/errors.ts`).

<div align=center>

|Gateway|Endpoints|Subsistema|
|-|-|-|
|`registerCatalogoRoutes`|CRUD de `entidades` y `direcciones`, `POST /api/direcciones/resolver`|S-CATA|
|`registerAlertasRoutes`|CRUD de `alertas`|S-ALER|
|`registerDireccionDetalleRoutes`|`GET /api/direcciones/:addr/{spot,perps,staking,fills}`|S-CATA *(extensión CU-07)*|
|`registerMetaRoutes`|`GET /api/meta/{tokens,perp-dexs,refresh,top-volumen,candles}`|S-CATA *(catálogo de HL)*|
|`registerLeaderboardBalancesRoutes`|`POST /api/leaderboard/saldos`|S-LEAD *(enriquecimiento)*|
|`registerHealth`|`GET /health`|*transversal*|

</div>

### Gateway WS

`registerLeaderboardGateway` (`<<gateway>>`): única responsabilidad del WS del backend; expone `/ws/leaderboard` y reenvía `LeaderboardActualizado` a los clientes suscritos.

### Frontend

<div align=center>

|Tipo|Artefacto|Responsabilidad|
|-|-|-|
|Pages|`LeaderboardPage`, `EntidadesPage`, `EntidadDetailPage`, `DireccionDetailPage`, `AlertasPage`|Una por boundary primaria del análisis|
|Features|`features/leaderboard/*`, `features/catalogo/*`, `features/alertas/*`|Componentes específicos de cada CdU (formularios, tablas, gráficos)|
|Core|`core/api.ts` (cliente HTTP), `core/AppDataContext.tsx` (estado global compartido)|Servicios transversales del frontend|

</div>

`AppDataContext` actúa como **boundary central de la sesión**: mantiene una única conexión WS al backend para el leaderboard, suscribe el catálogo y los mids, y los expone a todas las páginas con un solo proveedor de React.

## Trazabilidad análisis → diseño

<div align=center>

|Rol de análisis|Clase(s) de diseño|Módulo|
|-|-|-|
|`VistaLeaderboard`|`LeaderboardPage` + `LeaderboardTable` + `LeaderboardFilters` + `AppDataContext`|`web/src/pages/`, `web/src/features/leaderboard/`, `web/src/core/`|
|`VistaEntidades`|`EntidadesPage`, `EntidadDetailPage`, `DireccionDetailPage`, `EntidadForm`, `DireccionForm`|`web/src/pages/`, `web/src/features/catalogo/`|
|`VistaAlertas`|`AlertasPage`, `AlertaForm`|`web/src/pages/`, `web/src/features/alertas/`|
|`ConectorHyperliquid`|`PublicWsAdapter` (impl. de `IHyperliquidSource`)|`app/src/sources/`|
|`ConectorWebhook`|`WebhookConnector`|`app/src/modules/notificacion/`|
|`GestorConsultaLeaderboard`|`LeaderboardService` + `LeaderboardState` + `TradePersistence` + `LeaderboardBalancesService`|`app/src/modules/leaderboard/`|
|`GestorCatalogoEntidades`|`CatalogoService` (+ `AddressDetailService` y `MetaService` como colaboradores)|`app/src/modules/catalogo/`, `app/src/modules/direccion-detalle/`, `app/src/modules/meta/`|
|`GestorAlertasPrecio`|`AlertasService`|`app/src/modules/alertas/`|
|`GestorEvaluacionAlertas`|`wireEvaluacion` + `evaluarAlertasContraPrecio`|`app/src/modules/evaluacion/`|
|`GestorEnvioNotificacion`|`NotificacionService` + `startRetryWorker`|`app/src/modules/notificacion/`|
|`LeaderboardEnVivo`|`LeaderboardState` (in-memory) + tabla `lb_trades` (histórico)|`app/src/modules/leaderboard/leaderboard.state.ts`, `app/src/persistence/schema/lb_trades.ts`|
|Entidades del dominio|Tipos TS en `domain/types.ts` + tablas Drizzle en `persistence/schema/*`|`app/src/domain/`, `app/src/persistence/schema/`|

</div>

## Aplicación de SOLID

<div align=center>

|Principio|Aplicación concreta|
|-|-|
|**SRP**|`evaluator.ts` solo evalúa umbrales; `WebhookConnector` solo habla HTTP; `LeaderboardState` solo agrega; `TradePersistence` solo persiste trades|
|**OCP**|Nuevos consumidores se añaden al bus sin tocar productores; nuevos tipos de alerta implementan una nueva función de predicado; nuevo adaptador de HL implementa `IHyperliquidSource` y se registra en `createHyperliquidSource()`|
|**LSP**|`PublicWsAdapter` y `NanorethRpcAdapter` son intercambiables como `IHyperliquidSource` (con la salvedad de que el segundo no es funcional hoy; cuando lo sea, no requerirá cambios en clientes)|
|**ISP**|El puerto `IHyperliquidSource` se mantiene cohesivo (mismo proveedor); las consultas REST puntuales y la suscripción WS están en la misma interfaz porque el cliente de los adaptadores las usa juntas. Los servicios consumen sólo los métodos que necesitan|
|**DIP**|`LeaderboardService` y `AddressDetailService` dependen del puerto `IHyperliquidSource`, no de adaptadores concretos. El composition root es el único lugar que conoce a `PublicWsAdapter`|

</div>

## Diagramas por área

### Área Leaderboard (S-LEAD + S-INGE)

<div align=center>

![Clases de diseño — Leaderboard](../../imagenes/capitulo3/diseno-clases-leaderboard.svg)

</div>

### Área Catálogo (S-CATA)

<div align=center>

![Clases de diseño — Catálogo](../../imagenes/capitulo3/diseno-clases-catalogo.svg)

</div>

### Área Alertas (S-ALER)

<div align=center>

![Clases de diseño — Alertas](../../imagenes/capitulo3/diseno-clases-alertas.svg)

</div>

### Área Evaluación + Notificación (S-EVAL + S-NOTI)

<div align=center>

![Clases de diseño — Evaluación y Notificación](../../imagenes/capitulo3/diseno-clases-evaluacion.svg)

</div>

## Patrones aplicados

<div align=center>

|Patrón|Aplicación|Documento IdSw2|
|-|-|-|
|**Adapter**|`PublicWsAdapter`, `NanorethRpcAdapter`, `WebhookConnector`|[patronesIndireccion.md](../../IdSw2/temario/02-diseñoModular/patronesIndireccion.md)|
|**Repository (informal)**|Servicios que acceden a Drizzle integran la responsabilidad de repo dentro del servicio porque la frontera no añade valor (mismo lenguaje, mismo proceso, sin sustituibilidad pendiente)|[sc.bpp.md](../../IdSw2/temario/02-diseñoModular/sc.bpp.md)|
|**Observer / Bus**|`TypedBus` desacopla productores (`PublicWsAdapter`, composition root, `LeaderboardService`) de consumidores (`wireEvaluacion`, `LeaderboardGateway`)|[jerarquizacion.md](../../IdSw2/temario/02-diseñoModular/jerarquizacion.md) (L250)|
|**Strategy (vía interfaz)**|`IHyperliquidSource` permite cambiar la estrategia de obtención de datos de HL sin tocar el resto|[04-composicionVsHerencia.md](../../IdSw2/temario/01-diseño/04-composicionVsHerencia.md)|
|**Composition root**|`server.ts` cablea manualmente todos los servicios y adaptadores; el resto del código depende de interfaces|—|

</div>
