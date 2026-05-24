# Casos de uso implementados

La metodología pide, para esta sección del capítulo 4, mostrar la solución **a través de los casos de uso más representativos**, esta vez ya con elementos de interfaz reales. Los CdU seleccionados son los mismos cuatro que concentraron el riesgo técnico en el [análisis](../capitulo3/analisisCdU.md) y en el [diseño](../capitulo3/disenoCdU.md): **CU-01, CU-09, CU-13, CU-14**. Para cada uno se presenta la *cascada completa* que reclama la rúbrica de descripción de la solución:

<div align=center>

|Capa|Origen|
|-|-|
|Detalle del CdU|[Cap. 2 — Detalle de CdU](../capitulo2/detalleCdU.md)|
|Prototipo|[Cap. 2 — Prototipos de CdU](../capitulo2/prototiposCdU.md)|
|Análisis|[Cap. 3 — Análisis de CdU](../capitulo3/analisisCdU.md)|
|Diseño|[Cap. 3 — Diseño de CdU](../capitulo3/disenoCdU.md)|
|**Implementación**|Capítulo 4 *(esta sección)*: interfaz real + artefactos del código|

</div>

Los once CdU restantes (CU-02..CU-08, CU-10..CU-12), que comparten estructura CRUD, se documentan al final con el mismo nivel de detalle que en el [Diseño de CdU](../capitulo3/disenoCdU.md): una sola tabla parametrizable.

---

## CU-01 — Consultar leaderboard

### De la descripción al pixel

<div align=center>

|Capa|Artefacto|
|-|-|
|Detalle del CdU|[CU-01 en `detalleCdU.md`](../capitulo2/detalleCdU.md#cu-01--consultar-leaderboard)|
|Prototipo|[P1. Leaderboard](../capitulo2/prototiposCdU.md#p1--leaderboard)|
|Análisis|[Realización R(CU-01)](../capitulo3/analisisCdU.md) · `VistaLeaderboard` + `GestorConsultaLeaderboard` + `LeaderboardEnVivo` + `ConectorHyperliquid`|
|Diseño|[Realización de diseño CU-01](../capitulo3/disenoCdU.md#realización-de-cu-01--consultar-leaderboard) · `LeaderboardService` + `LeaderboardState` + `TradePersistence` + `PublicWsAdapter`|
|Implementación (UI)|`web/src/pages/LeaderboardPage.tsx` + `web/src/features/leaderboard/*` + `web/src/core/AppDataContext.tsx`|
|Implementación (back)|`app/src/modules/leaderboard/*` + `app/src/sources/public-ws.adapter.ts`|

</div>

### Recorrido del flujo principal sobre la interfaz real

1. **Estado inicial.** El usuario abre la aplicación; el router redirige a `/leaderboard` (paso 1 del detalle de CdU). `AppDataContext` —ya inicializado por el bootstrap del SPA— ha precargado el catálogo de tokens y mantiene la conexión WebSocket única con el backend (RS-01).
2. **Selección de la terna.** `LeaderboardFilters` ofrece tres controles (`mercado`, `token`, `temporalidad`) y un toggle de lado (compradores/vendedores). Cualquier cambio dispara `setSelection(...)` y, a través del contexto, un mensaje WebSocket `subscribe` con la nueva terna (paso 2-3 del detalle).
3. **Apertura del canal en el backend.** `registerLeaderboardGateway` recibe la suscripción y delega en `LeaderboardService.subscribe(terna)`, que (a) traduce el `displayToken` al `feedCoin` interno de Hyperliquid usando `MetaService`, (b) abre o reutiliza el canal de trades y (c) siembra el snapshot inicial desde `LeaderboardState` y desde `lb_trades` para temporalidades largas (paso 4 del detalle).
4. **Ingestión continua.** `PublicWsAdapter` mantiene la suscripción al canal de trades de Hyperliquid. Cada trade que llega se desambigua por `tid`, se persiste en `lb_trades` vía `TradePersistence` y se agrega en `LeaderboardState` (pasos 5-6).
5. **Resolución de nombres y empuje al cliente.** `LeaderboardActualizado` se publica en el bus; `LeaderboardGateway` lo reenvía al cliente. El componente `LeaderboardTable` invoca `POST /api/direcciones/resolver` por lote para sustituir las direcciones conocidas por el nombre de la entidad asociada (paso 7), y pinta la clasificación ordenada por volumen (paso 8). La cabecera de la página muestra el precio mid del token en vivo, alimentado por el mismo flujo `allMids` (paso 9).
6. **Cobertura de ventana.** Una franja `CoverageBar` informa al usuario del progreso de la ventana en vivo desde que se eligió la terna: hasta que llega al 100% (`1h`, `4h`, `6h`, `12h`, `1d`, `1w`), el ranking se está rellenando con datos que entran en tiempo real. A partir de ahí la ventana es deslizante.

### Flujos alternativos materializados

<div align=center>

|Flujo alt. (cap. 2)|Cómo se manifiesta en la UI|
|-|-|
|*3a — El Usuario cambia la selección*|Cambiar mercado, token o temporalidad re-suscribe con la nueva terna; la tabla se rehace desde el snapshot inicial|
|*5a — Hyperliquid L1 interrumpe el flujo*|`PriceTicker` y `LeaderboardTable` mantienen la última clasificación; el indicador *Estado* de la cabecera del leaderboard pasa de *En vivo* a *connecting / closed* y muestra un mensaje en rojo bajo la cabecera|

</div>

### Endpoints implicados

<div align=center>

|Origen del cliente|Endpoint|Propósito|
|-|-|-|
|`AppDataContext`|`WS /ws/leaderboard`|Suscripción a actualizaciones incrementales|
|`AppDataContext`|`WS /ws/leaderboard` *(canal `allMids` reenviado)*|Empuja precios mid en vivo para todos los tokens|
|`LeaderboardTable`|`POST /api/direcciones/resolver`|Resuelve nombres de las entidades conocidas por lote|
|`LightweightChart`|`GET /api/meta/candles`|Velas históricas para el gráfico|

</div>

### Captura

<div align=center>

![CU-01 — Leaderboard en vivo](../../imagenes/capitulosFinales/cu-01-leaderboard.png)

</div>

---

## CU-09 — Crear alerta de precio

### De la descripción al pixel

<div align=center>

|Capa|Artefacto|
|-|-|
|Detalle del CdU|[CU-09 en `detalleCdU.md`](../capitulo2/detalleCdU.md#cu-09--crear-alerta-de-precio)|
|Prototipo|[P5 (relación) + P6 (edición)](../capitulo2/prototiposCdU.md#p5--relación-de-alertas)|
|Análisis|`VistaAlertas` + `GestorAlertasPrecio` + `ConectorWebhook` + `AlertaPrecio` + `Webhook`|
|Diseño|[Realización de diseño CU-09](../capitulo3/disenoCdU.md#realización-de-cu-09--crear-alerta-de-precio) · `AlertasService.crear` + `WebhookConnector.checkReachability` + `encryptWebhook` (`pgcrypto`)|
|Implementación (UI)|`web/src/features/alertas/AlertaForm.tsx` + `web/src/pages/AlertasPage.tsx`|
|Implementación (back)|`app/src/modules/alertas/alertas.routes.ts` + `app/src/modules/alertas/alertas.service.ts` + `app/src/modules/notificacion/webhook.connector.ts`|

</div>

### Recorrido del flujo principal sobre la interfaz real

1. **Punto de entrada.** Desde `AlertasPage` el usuario pulsa *Nueva alerta*. El componente `AlertaForm` se abre como diálogo modal sobre la propia relación (paso 1).
2. **Mercado y token.** El formulario presenta tres pestañas correspondientes a los tres mercados (`Perp`, `Spot`, `HIP-3`) y un `Combobox` agrupado con el catálogo de tokens del mercado seleccionado, alimentado por `MetaService` a través de `AppDataContext` (paso 2-3).
3. **Umbral y webhook.** Dos controles adicionales: un *Cruce* (`SUBE` / `BAJA`) con un campo numérico para el valor del umbral, y un `Input` para la URL del webhook (paso 4-5).
4. **Validación en el servidor.** Al confirmar, el cliente hace `POST /api/alertas`. La ruta valida el cuerpo con Zod (formato de URL, umbral > 0, mercado válido, token presente en el catálogo). `AlertasService.crear` realiza `WebhookConnector.checkReachability` (HEAD/GET con timeout corto), cifra la URL con `encryptWebhook` (`pgp_sym_encrypt`) e `INSERT` en la tabla `alertas` con estado `OPERATIVA` (paso 6-7 del detalle).
5. **Confirmación.** La respuesta incluye un campo `webhookAlcanzable: boolean` que el cliente convierte en una notificación toast: éxito si el webhook respondió, o aviso si no respondió pero la alerta quedó registrada igualmente (paso 8). La relación se invalida y se vuelve a consultar.

### Flujos alternativos materializados

<div align=center>

|Flujo alt. (cap. 2)|Cómo se manifiesta en la UI|
|-|-|
|*6a — Umbral inválido*|Zod responde 400 con un mensaje detallado; el toast lo muestra y el formulario permanece abierto con los campos rellenos|
|*6b — Webhook no alcanzable*|La alerta se crea, pero el toast informa "Alerta creada · Webhook no alcanzable: …". El estado en la tabla pasa por `OPERATIVA` hasta que se dispare la primera notificación|

</div>

### Endpoints implicados

<div align=center>

|Endpoint|Propósito|
|-|-|
|`POST /api/alertas`|Alta de alerta (CU-09)|
|`GET /api/meta/tokens?mercado=…`|Carga del catálogo para el combobox|

</div>

### Por qué el cifrado del webhook es parte del CdU

El RS-10 exige que la URL del webhook no quede legible en interfaces de consulta. La realización combina dos decisiones:

<div align=center>

|Punto|Decisión|
|-|-|
|En memoria del servicio|La URL en claro vive solo el tiempo de la transacción de alta (validación + cifrado + INSERT)|
|En base de datos|La columna `webhook_url_enc` es `bytea`; el campo se descifra solo cuando un actor autorizado (el propio `AlertasService.listar` o el evaluador) lo necesita|
|Clave maestra|`APP_SECRET` se inyecta por variable de entorno en el contenedor; nunca se serializa|

</div>

### Captura

<div align=center>

![CU-09 — Formulario de alerta](../../imagenes/capitulosFinales/cu-09-alerta-form.png)

</div>

---

## CU-13 — Evaluar alertas activas

### De la descripción al pixel

CU-13 no es un caso de uso *del usuario*: tiene como actor a **Hyperliquid L1** y se ejecuta automáticamente cada vez que el flujo continuo entrega una actualización de precio. Su "interfaz" no es una pantalla sino el cambio de estado de las alertas registradas, visible para el usuario en `AlertasPage`.

<div align=center>

|Capa|Artefacto|
|-|-|
|Detalle del CdU|[CU-13 en `detalleCdU.md`](../capitulo2/detalleCdU.md#cu-13--evaluar-alertas-activas)|
|Análisis|`ConectorHyperliquid` + `GestorEvaluacionAlertas` + `GestorAlertasPrecio` + `AlertaPrecio`|
|Diseño|[Realización de diseño CU-13](../capitulo3/disenoCdU.md#realización-de-cu-13--evaluar-alertas-activas) · suscriptor `wireEvaluacion` + función pura `evaluarAlertasContraPrecio`|
|Implementación|`app/src/server.ts` *(composition root: traducción `midsKey → display token`)* + `app/src/modules/evaluacion/evaluacion.subscriber.ts` + `app/src/modules/evaluacion/evaluator.ts`|

</div>

### Recorrido del flujo principal sobre el sistema en marcha

1. **Recepción del precio.** `PublicWsAdapter` mantiene la suscripción `allMids`. En `server.ts` el composition root compara cada `midsKey` con la última lectura conocida; para cada cambio, traduce la clave a su *display token* con `MetaService.getMidsKeyToDisplay()` y publica `PrecioActualizado` en el bus (paso 1).
2. **Suscripción al evento.** `wireEvaluacion`, registrado en el bootstrap, está suscrito a `PrecioActualizado` desde el primer instante (paso 2).
3. **Recuperación de alertas operativas.** Una `SELECT ... WHERE token_simbolo=? AND estado='OPERATIVA'`, cubierta por el índice `alertas_token_estado`, devuelve las alertas activas para ese token (paso 2 del detalle).
4. **Evaluación pura.** `evaluarAlertasContraPrecio` aplica el predicado `evaluarUmbral(umbral, precio)` (función pura definida en `domain/types.ts`) a cada alerta y devuelve los IDs de las que han cruzado el umbral (paso 3).
5. **Disparo.** Por cada alerta disparada:
   - `UPDATE alertas SET estado='DISPARADA', ultimo_disparo=now() WHERE id=...` (paso 4).
   - `bus.emit('AlertaDisparada', ...)` para observabilidad.
   - Llamada directa a `NotificacionService.dispararParaAlerta(alertaId, precio)` para encadenar CU-14 (paso 5 — relación `<<include>>` de la captura del capítulo 2).

### Lo que ve el usuario

El usuario nunca dispara CU-13 directamente. Lo que observa es:

<div align=center>

|En la interfaz|Significado funcional|
|-|-|
|`AlertasPage` se refresca cada 6 s|La columna *Estado* pasa de `OPERATIVA` a `DISPARADA` (o a `NOTIFICACION_FALLIDA` si CU-14 falla y se agota el reintento)|
|Columna *Último disparo*|Se rellena con `relativeTime(...)` apuntando al instante en que CU-13 dejó la alerta en `DISPARADA`|

</div>

### Cumplimiento de los requisitos suplementarios

<div align=center>

|RS|Cómo lo cubre la implementación de CU-13|
|-|-|
|**RS-02** ≤ 2 s|Pipeline `WS allMids → bus → SELECT indexado → UPDATE` en proceso, sin saltos de red entre evaluación y persistencia|
|**RS-04** Extensibilidad|Un nuevo tipo de alerta requiere únicamente una nueva función `evaluar…` en `evaluator.ts`; el resto del flujo no cambia|
|**RS-09** Trazabilidad|`UPDATE alertas SET ultimo_disparo=...` + `INSERT` en `notificaciones` desde CU-14 cierran el rastro|

</div>

### Captura

<div align=center>

![CU-13 — Transición de estado en `AlertasPage`](../../imagenes/capitulosFinales/cu-13-estado-alerta.png)

</div>

---

## CU-14 — Enviar notificación

### De la descripción al pixel

<div align=center>

|Capa|Artefacto|
|-|-|
|Detalle del CdU|[CU-14 en `detalleCdU.md`](../capitulo2/detalleCdU.md#cu-14--enviar-notificación)|
|Análisis|`GestorEnvioNotificacion` + `ConectorWebhook` + `Notificacion`|
|Diseño|[Realización de diseño CU-14](../capitulo3/disenoCdU.md#realización-de-cu-14--enviar-notificación) · `NotificacionService.dispararParaAlerta` + `WebhookConnector.transmit` + `startRetryWorker`|
|Implementación|`app/src/modules/notificacion/notificacion.service.ts` + `app/src/modules/notificacion/webhook.connector.ts` + `app/src/modules/notificacion/retry.worker.ts`|

</div>

### Recorrido del flujo principal

1. **Disparo.** Tras CU-13, `NotificacionService.dispararParaAlerta(alertaId, precio)` realiza un `INSERT` en `notificaciones` con `estado='PENDIENTE'`, `precio_disparador`, `instante_emision=now()`, `intento=1`, `proximo_intento=now()`. Lanza `transmitirYActualizar(notificacionId)` en background, sin bloquear el evaluador (paso 1 del detalle).
2. **Recuperación de la URL.** `transmitirYActualizar` ejecuta un `SELECT` con `pgp_sym_decrypt(webhook_url_enc, APP_SECRET)` para obtener la URL en claro solo el tiempo de la llamada saliente (paso 1-2).
3. **Transmisión.** `WebhookConnector.transmit(url, payload)` realiza `POST` con cuerpo JSON y timeout de 10 s (paso 2).
4. **Confirmación o fallo.**
   - **Éxito**: `UPDATE notificaciones SET estado='ENTREGADA', entregada_en=now()` + `UPDATE alertas SET estado='OPERATIVA'` (rearme); emite `NotificacionConfirmada` al bus (paso 3-5 del detalle).
   - **Fallo**: calcula `proximo_intento` con la política de backoff acumulado configurable (por defecto `1, 5, 30, 300, 1800, 3600` segundos); `UPDATE notificaciones SET estado='FALLIDA' (transitorio), intento=intento+1, proximo_intento=...`; `UPDATE alertas SET estado='NOTIFICACION_FALLIDA'`; emite `NotificacionFallida` (flujo alt. *3a* del detalle).
5. **Cola virtual de reintentos.** `startRetryWorker`, despertándose cada `NOTIFICATION_RETRY_TICK_SECONDS`, ejecuta una `SELECT ... WHERE estado IN ('PENDIENTE','FALLIDA') AND proximo_intento <= now()` (cubierta por el índice `notif_pendientes_proximas`) y vuelve a llamar a `transmitirYActualizar` para cada fila pendiente. Cuando `intento` supera el máximo configurado, la notificación queda en `FALLIDA` permanente y el worker la deja de tomar.

### Lo que ve el usuario

<div align=center>

|En la interfaz|Significado funcional|
|-|-|
|Columna *Estado* en `AlertasPage`|Pasa de `DISPARADA` a `OPERATIVA` al rearmarse; a `NOTIFICACION_FALLIDA` si se agotan los reintentos|
|Columna *Último disparo*|Mantiene la marca de la última activación, independientemente del resultado de la entrega|

</div>

### Cumplimiento de los requisitos suplementarios

<div align=center>

|RS|Cómo lo cubre la implementación de CU-14|
|-|-|
|**RS-07** Reintentos|`startRetryWorker` + backoff configurable; cola virtual en `notificaciones`|
|**RS-09** Trazabilidad|Cada disparo deja una fila en `notificaciones` con `alerta_id`, `precio_disparador`, `instante_emision`, `intento`, `estado`|
|**RS-10** Seguridad|La URL solo se descifra durante la transmisión; no se devuelve en ningún listado público|

</div>

### Cuerpo de la notificación recibida por el webhook

```json
{
  "evento": "alerta_disparada",
  "alertaId": "8c0e…",
  "token": "BTC.p",
  "mercado": "PerpNativo",
  "umbral": { "cruce": "SUBE", "valor": 100000 },
  "precioDisparador": 100123.5,
  "instanteEmision": "2026-05-22T10:23:51.412Z",
  "intento": 1
}
```

### Captura

<div align=center>

![CU-14 — Transición a `OPERATIVA` tras entrega exitosa](../../imagenes/capitulosFinales/cu-14-rearme.png)

</div>

---

## Casos de uso CRUD — CU-02..CU-08 y CU-10..CU-12

Estos once CdU comparten estructura (cliente → ruta → servicio → tabla) y se documentan agrupados, como ya se hizo en el [diseño de CdU](../capitulo3/disenoCdU.md#patrón-crud--cu-02cu-08-y-cu-10cu-12).

<div align=center>

|CdU|Componente UI|Endpoint REST|Servicio|Tabla|
|-|-|-|-|-|
|**CU-02** Crear entidad|`EntidadForm` (modal)|`POST /api/entidades`|`CatalogoService.crearEntidad`|`entidades`|
|**CU-03** Abrir entidades|`EntidadesPage` (filtro `q`)|`GET /api/entidades`|`CatalogoService.listarEntidades`|`entidades`|
|**CU-04** Editar entidad|`EntidadForm` (precargado)|`PATCH /api/entidades/:id`|`CatalogoService.renombrarEntidad`|`entidades`|
|**CU-05** Eliminar entidad|Botón papelera + `confirm`|`DELETE /api/entidades/:id`|`CatalogoService.eliminarEntidad`|`entidades` + cascada en `direcciones`|
|**CU-06** Añadir dirección|`DireccionForm`|`POST /api/entidades/:id/direcciones`|`CatalogoService.aniadirDireccion`|`direcciones`|
|**CU-07** Abrir direcciones|Sección *Direcciones* en `EntidadDetailPage`|`GET /api/entidades/:id/direcciones`|`CatalogoService.listarDirecciones`|`direcciones`|
|**CU-07** *(extensión)* Detalle global|`DireccionDetailPage` (4 pestañas)|`GET /api/direcciones/:addr/{spot,perps,staking,fills}`|`AddressDetailService.*`|*(no persistencia local)*|
|**CU-08** Eliminar dirección|Botón papelera + `confirm`|`DELETE /api/entidades/:id/direcciones/:dirId`|`CatalogoService.eliminarDireccion`|`direcciones`|
|**CU-10** Abrir alertas|`AlertasPage` (filtro de estado)|`GET /api/alertas`|`AlertasService.listar`|`alertas`|
|**CU-11** Editar alerta|`AlertaForm` (precargado)|`PATCH /api/alertas/:id`|`AlertasService.actualizar`|`alertas`|
|**CU-12** Eliminar alerta|Botón papelera + `confirm`|`DELETE /api/alertas/:id`|`AlertasService.eliminar`|`alertas` + cascada en `notificaciones`|

</div>

### Patrón común

1. El cliente envía la petición desde el formulario (`*Form`) o desde un botón con confirmación.
2. La ruta `*.routes.ts` valida el cuerpo con Zod, devolviendo `400 Bad Request` con detalle si la validación falla.
3. El servicio (`*Service.<verbo>`) valida invariantes del dominio (unicidad de nombre, formato de dirección, validez del umbral, existencia previa para edición y baja) y persiste con Drizzle.
4. Los errores de dominio (`EntidadNoEncontrada`, `AlertaNoEncontrada`, `DireccionYaAsociada`, etc.) son interceptados por el filtro global de Fastify (`shared/errors.ts`) y mapeados a códigos HTTP coherentes.
5. La UI invalida la caché de React Query y vuelve a consultar; un toast (`sonner`) confirma o explica el resultado.

> El detalle paso a paso de cada uno está cubierto en [Detalle de CdU](../capitulo2/detalleCdU.md). La realización de diseño está en [Diseño de CdU](../capitulo3/disenoCdU.md). La implementación —ya con interfaz real— sigue el patrón anterior sin desviaciones.

---

## Trazabilidad — del repositorio al diagrama de contexto

<div align=center>

|CdU|Implementación (back)|Implementación (front)|Estado del cap. 2 que recorre|
|-|-|-|-|
|CU-01|`modules/leaderboard/*` + `sources/public-ws.adapter.ts`|`pages/LeaderboardPage.tsx` + `features/leaderboard/*`|`SISTEMA_DISPONIBLE → LEADERBOARD_ABIERTO`|
|CU-02|`modules/catalogo/catalogo.service.ts` *(`crearEntidad`)*|`features/catalogo/EntidadForm.tsx`|`ENTIDADES_ABIERTAS → ENTIDAD_ABIERTA`|
|CU-03|`modules/catalogo/catalogo.service.ts` *(`listarEntidades`)*|`pages/EntidadesPage.tsx`|`SISTEMA_DISPONIBLE → ENTIDADES_ABIERTAS`|
|CU-04|`modules/catalogo/catalogo.service.ts` *(`renombrarEntidad`)*|`features/catalogo/EntidadForm.tsx`|`ENTIDADES_ABIERTAS → ENTIDAD_ABIERTA`|
|CU-05|`modules/catalogo/catalogo.service.ts` *(`eliminarEntidad`)*|`pages/EntidadesPage.tsx`|`ENTIDADES_ABIERTAS` *(in situ)*|
|CU-06|`modules/catalogo/catalogo.service.ts` *(`aniadirDireccion`)*|`features/catalogo/DireccionForm.tsx`|`DIRECCIONES_ABIERTAS` *(in situ)*|
|CU-07|`modules/catalogo/catalogo.service.ts` *(`listarDirecciones`)* + `modules/direccion-detalle/*`|`pages/EntidadDetailPage.tsx` + `pages/DireccionDetailPage.tsx`|`ENTIDAD_ABIERTA → DIRECCIONES_ABIERTAS` *(+ extensión)*|
|CU-08|`modules/catalogo/catalogo.service.ts` *(`eliminarDireccion`)*|`pages/EntidadDetailPage.tsx`|`DIRECCIONES_ABIERTAS` *(in situ)*|
|CU-09|`modules/alertas/alertas.service.ts` *(`crear`)*|`features/alertas/AlertaForm.tsx`|`ALERTAS_ABIERTAS → ALERTA_ABIERTA`|
|CU-10|`modules/alertas/alertas.service.ts` *(`listar`)*|`pages/AlertasPage.tsx`|`SISTEMA_DISPONIBLE → ALERTAS_ABIERTAS`|
|CU-11|`modules/alertas/alertas.service.ts` *(`actualizar`)*|`features/alertas/AlertaForm.tsx`|`ALERTAS_ABIERTAS → ALERTA_ABIERTA`|
|CU-12|`modules/alertas/alertas.service.ts` *(`eliminar`)*|`pages/AlertasPage.tsx`|`ALERTAS_ABIERTAS` *(in situ)*|
|CU-13|`modules/evaluacion/evaluacion.subscriber.ts` + `evaluator.ts`|*(sin UI propia: se manifiesta en `AlertasPage`)*|*(transición interna; ver [diagrama de contexto](../capitulo2/diagramaDeContexto.md))*|
|CU-14|`modules/notificacion/notificacion.service.ts` + `webhook.connector.ts` + `retry.worker.ts`|*(sin UI propia: se manifiesta en `AlertasPage`)*|*(transición interna)*|

</div>

Cada CdU del catálogo del capítulo 2 tiene su implementación en el repositorio, su sitio en el diagrama de contexto y su trazado al diseño del capítulo 3. La rúbrica de descripción de la solución se cumple **por construcción**: el repositorio es la solución, y este capítulo solo lo recorre con la guía de los CdU.
