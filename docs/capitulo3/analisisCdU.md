# Análisis de los casos de uso

Por cada caso de uso del catálogo se construye una **realización de análisis** que identifica los objetos participantes, sus responsabilidades y la colaboración entre ellos. Siguiendo la priorización ya establecida, se desarrollan en detalle los cuatro CdU que concentran el riesgo técnico (CU-01, CU-09, CU-13, CU-14) y se documenta un **patrón común** para los once CdU CRUD homogéneos.

## Convenciones

Se usa la notación de Jacobson, con tres estereotipos de clase de análisis:

<div align=center>

|Estereotipo|Rol|Identificación|
|-|-|-|
|`<<boundary>>`|Frontera del sistema|Una por actor humano (primaria), una por entidad expuesta al usuario (primitiva) y una por actor-sistema externo (central)|
|`<<control>>`|Coordinación|Una por caso de uso, encapsula su escenario|
|`<<entity>>`|Concepto del dominio|Trazado directamente desde el modelo del dominio|

</div>

Los participantes no son clases de programación: son **roles** que en el [diseño de clases](disenoClases.md) se refinan a artefactos concretos.

## Catálogo de participantes

Las clases identificadas y su trazabilidad con la captura de casos de uso y el modelo del dominio:

### Clases `<<boundary>>` (frontera)

<div align=center>

|Clase|Tipo|Origen|Subsistema|
|-|-|-|-|
|`VistaLeaderboard`|Primaria|Prototipo P1 + Usuario (actor)|S-PRES|
|`VistaEntidades`|Primaria|Prototipos P2, P3, P4 + Usuario|S-PRES|
|`VistaAlertas`|Primaria|Prototipos P5, P6 + Usuario|S-PRES|
|`ConectorHyperliquid`|Central|Actor Hyperliquid L1|S-INGE|
|`ConectorWebhook`|Central|Actor Servicio Webhook|S-NOTI|

</div>

### Clases `<<control>>` (controladores de CdU)

<div align=center>

|Clase|CdU que coordina|Subsistema|
|-|-|-|
|`GestorConsultaLeaderboard`|CU-01|S-LEAD|
|`GestorCatalogoEntidades`|CU-02, CU-03, CU-04, CU-05, CU-06, CU-07, CU-08|S-CATA|
|`GestorAlertasPrecio`|CU-09, CU-10, CU-11, CU-12|S-ALER|
|`GestorEvaluacionAlertas`|CU-13|S-EVAL|
|`GestorEnvioNotificacion`|CU-14|S-NOTI|

</div>

### Clases `<<entity>>` (dominio)

Refinadas directamente del modelo del dominio:

<div align=center>

|Clase|Propiedades esenciales|Invariantes/Estados|
|-|-|-|
|`Entidad`|`id`, `nombre`|Nombre único|
|`Direccion`|`valor`, `entidad`|Formato `0x[a-f0-9]{40}`; única|
|`AlertaPrecio`|`mercado`, `token`, `umbral`, `webhook`, `estado`|Estados: OPERATIVA → DISPARADA → OPERATIVA / NOTIFICACION_FALLIDA|
|`Notificacion`|`alerta`, `precioDisparador`, `instanteEmision`, `estado`|Estados: PENDIENTE → ENTREGADA / FALLIDA|
|`Operacion`|`mercado`, `token`, `direccion`, `volumenUsd`, `lado`, `instante`|`volumenUsd > 0`|
|`Precio`|`token`, `valor`, `instante`|`valor > 0`|
|`LeaderboardEnVivo`|`mercado`, `token`, `temporalidad`, agregados por dirección|Derivada del flujo de `Operacion`; sin persistencia transaccional|

</div>

> `LeaderboardEnVivo` es una **entidad derivada** propia del análisis: representa el estado agregado por terna. No proviene del modelo del dominio porque allí se modelaron únicamente conceptos de negocio; la agregación es una abstracción introducida aquí, en el análisis, para razonar sobre el flujo continuo desde la L1.

### Diagrama global

<div align=center>

![Clases de análisis — visión global](../../imagenes/capitulo3/analisis-clases-global.svg)

</div>

---

## Realización de CU-01 — Consultar leaderboard

### Participantes

<div align=center>

|Rol|Clase|
|-|-|
|Actor humano|Usuario|
|Actor externo|Hyperliquid L1|
|Frontera|`VistaLeaderboard`, `ConectorHyperliquid`|
|Controlador|`GestorConsultaLeaderboard`, `GestorCatalogoEntidades` *(consulta)*|
|Entidades|`LeaderboardEnVivo`, `Operacion`, `Entidad`, `Direccion`|

</div>

### Colaboración

1. El **Usuario** interactúa con `VistaLeaderboard` y selecciona mercado, token y temporalidad.
2. `VistaLeaderboard` solicita a `GestorConsultaLeaderboard` la suscripción a esa terna.
3. `GestorConsultaLeaderboard` solicita a `ConectorHyperliquid` el flujo continuo de operaciones para el token seleccionado, si aún no estuviera abierto.
4. **Hyperliquid L1** envía `Operacion` por ese canal. `ConectorHyperliquid` las publica como eventos `OperacionRecibida` en el bus del dominio.
5. `GestorConsultaLeaderboard`, suscrito a `OperacionRecibida`, agrega cada operación en `LeaderboardEnVivo` según `mercado`, `token`, `temporalidad` y `lado`, respetando la ventana deslizante asociada a la temporalidad.
6. Para las direcciones presentes, `GestorConsultaLeaderboard` (o la propia `VistaLeaderboard`, según se decida en diseño) consulta `GestorCatalogoEntidades` para resolver nombres de entidades conocidas.
7. `VistaLeaderboard` recibe el snapshot inicial y, a continuación, las actualizaciones incrementales mientras la suscripción esté activa.

### Diagrama

<div align=center>

![Realización R(CU-01)](../../imagenes/capitulo3/analisis-R-CU-01.svg)

</div>

### Notas de análisis

- La actualización del leaderboard es **reactiva**: el controlador no consulta a la L1, se suscribe. Esto materializa el mecanismo de propagación de eventos identificado en el [análisis de la arquitectura](analisisArquitectura.md).
- `LeaderboardEnVivo` es un concepto derivado del flujo: si el proceso se reinicia, se reconstruye replicando el flujo (RS-03). Esto se discute en detalle en el [diseño de clases](disenoClases.md).
- La resolución de nombres es una colaboración entre subsistemas (S-LEAD ↔ S-CATA) sobre una operación de consulta pura: no muta estado.

---

## Realización de CU-09 — Crear alerta de precio

### Participantes

<div align=center>

|Rol|Clase|
|-|-|
|Actor humano|Usuario|
|Actor externo|Servicio Webhook|
|Frontera|`VistaAlertas`, `ConectorWebhook`|
|Controlador|`GestorAlertasPrecio`|
|Entidades|`AlertaPrecio`, `Webhook`, `Umbral`|

</div>

### Colaboración

1. El **Usuario** interactúa con `VistaAlertas` e introduce mercado, token, umbral (`SUBE`/`BAJA`, valor) y dirección del webhook.
2. `VistaAlertas` solicita a `GestorAlertasPrecio` el registro de la alerta.
3. `GestorAlertasPrecio` valida la coherencia de los datos (formato del umbral, formato del webhook).
4. `GestorAlertasPrecio` pide a `ConectorWebhook` que verifique la alcanzabilidad del webhook destino. La respuesta no bloquea el registro; un webhook inalcanzable se persiste como aviso al Usuario.
5. `GestorAlertasPrecio` crea una instancia de `AlertaPrecio` en estado `OPERATIVA`, custodiando la URL del webhook con la garantía de no legibilidad externa (RS-10).
6. `VistaAlertas` confirma el registro al Usuario.

### Diagrama

<div align=center>

![Realización R(CU-09)](../../imagenes/capitulo3/analisis-R-CU-09.svg)

</div>

### Notas de análisis

- La operación es **transaccional**: el alta queda registrada con todas sus invariantes o no se registra. Esto se concreta como persistencia ACID en el diseño.
- La verificación del webhook es una operación auxiliar — RS-07 garantiza que un webhook que falle al disparar la alerta podrá reintentarse, así que su verificación previa no es un punto de fallo absoluto.

---

## Realización de CU-13 — Evaluar alertas activas

### Participantes

<div align=center>

|Rol|Clase|
|-|-|
|Actor externo|Hyperliquid L1|
|Frontera|`ConectorHyperliquid`|
|Controlador|`GestorEvaluacionAlertas`, `GestorAlertasPrecio` *(consulta)*, `GestorEnvioNotificacion` *(`<<include>>`)*|
|Entidades|`Precio`, `AlertaPrecio`, `Umbral`|

</div>

### Colaboración

1. **Hyperliquid L1** envía una actualización de precio a `ConectorHyperliquid`.
2. `ConectorHyperliquid` publica `PrecioActualizado` en el bus del dominio.
3. `GestorEvaluacionAlertas`, suscrito a `PrecioActualizado`, consulta a `GestorAlertasPrecio` las alertas `OPERATIVA` para ese token.
4. Para cada alerta, comprueba si el `Precio` cumple el `Umbral` definido. Si lo cumple:
   - Marca la alerta como `DISPARADA`.
   - Solicita a `GestorEnvioNotificacion` la realización de CU-14 (relación `<<include>>` ya identificada en la captura de casos de uso).

### Diagrama

<div align=center>

![Realización R(CU-13)](../../imagenes/capitulo3/analisis-R-CU-13.svg)

</div>

### Notas de análisis

- La consulta a `GestorAlertasPrecio` debe estar indexada por `token` y `estado` para cumplir RS-02 (≤ 2 segundos por evaluación).
- Si la evaluación de una alerta falla (problema técnico al consultar o al actualizar), el sistema lo reintenta en la siguiente actualización de precio: el flujo continuo de la L1 lo permite sin políticas de reintento explícitas para este CdU.

---

## Realización de CU-14 — Enviar notificación

### Participantes

<div align=center>

|Rol|Clase|
|-|-|
|Actor externo|Servicio Webhook|
|Frontera|`ConectorWebhook`|
|Controlador|`GestorEnvioNotificacion`|
|Entidades|`AlertaPrecio`, `Notificacion`, `Webhook`, `Precio`|

</div>

### Colaboración

1. `GestorEvaluacionAlertas` invoca a `GestorEnvioNotificacion` con la alerta disparada y el precio que la disparó.
2. `GestorEnvioNotificacion` crea una `Notificacion` en estado `PENDIENTE` asociada a la alerta y al precio.
3. `GestorEnvioNotificacion` solicita a `ConectorWebhook` la transmisión del aviso al destino registrado en la alerta.
4. Si el Servicio Webhook confirma la recepción, `GestorEnvioNotificacion` marca la `Notificacion` como `ENTREGADA` y rearma la alerta a `OPERATIVA`.
5. Si la transmisión falla o no se confirma, marca la `Notificacion` como pendiente de reintento, programa el siguiente intento según la política de backoff y deja la alerta en `NOTIFICACION_FALLIDA` hasta que la entrega prospere.

### Diagrama

<div align=center>

![Realización R(CU-14)](../../imagenes/capitulo3/analisis-R-CU-14.svg)

</div>

### Notas de análisis

- La política de reintentos (RS-07) es una característica del subsistema S-NOTI, no del receptor: el Servicio Webhook puede ser puntualmente inalcanzable sin afectar al resto del sistema.
- La trazabilidad (RS-09) se materializa al guardar cada `Notificacion` con referencia a la alerta y al precio: cualquier entrega es auditable.

---

## Patrón CRUD para CU-02..CU-08 y CU-10..CU-12

Los once CdU restantes comparten estructura: el Usuario solicita una operación sobre una entidad a través de su vista; el controlador del subsistema correspondiente valida y persiste; el sistema confirma. Se documentan agrupados para evitar duplicación.

### Plantilla de participantes

<div align=center>

|Rol|Clase|Sustitución por CdU|
|-|-|-|
|Actor|Usuario|—|
|Frontera|`Vista<Concepto>`|`VistaEntidades` (CU-02..05, CU-07), `VistaAlertas` (CU-10..12), embebida en `VistaEntidades` (CU-06, CU-08)|
|Controlador|`Gestor<Concepto>`|`GestorCatalogoEntidades` (CU-02..08), `GestorAlertasPrecio` (CU-10..12)|
|Entidad|`Entidad`, `Direccion` o `AlertaPrecio`|según el CdU|

</div>

### Colaboración genérica

1. El Usuario solicita la operación desde la vista.
2. La vista delega en el gestor con los datos introducidos.
3. El gestor valida invariantes (unicidad, formato, existencia) y, en operaciones de baja, solicita confirmación.
4. El gestor persiste la mutación o devuelve la consulta.
5. La vista presenta confirmación o el resultado al Usuario.

### Tabla de cobertura

<div align=center>

|CdU|Vista|Gestor|Mutación|
|-|-|-|-|
|**CU-02** Crear entidad|`VistaEntidades`|`GestorCatalogoEntidades`|Inserción de `Entidad` (nombre único)|
|**CU-03** Abrir entidades|`VistaEntidades`|`GestorCatalogoEntidades`|Consulta sin mutación|
|**CU-04** Editar entidad|`VistaEntidades`|`GestorCatalogoEntidades`|Actualización de `Entidad.nombre`|
|**CU-05** Eliminar entidad|`VistaEntidades`|`GestorCatalogoEntidades`|Baja de `Entidad` y vínculos|
|**CU-06** Añadir dirección|`VistaEntidades`|`GestorCatalogoEntidades`|Inserción de `Direccion`|
|**CU-07** Abrir direcciones|`VistaEntidades`|`GestorCatalogoEntidades`|Consulta sin mutación *(con flujo alternativo "detalle global" que delega en `ConectorHyperliquid`)*|
|**CU-08** Eliminar dirección|`VistaEntidades`|`GestorCatalogoEntidades`|Baja del vínculo de `Direccion`|
|**CU-10** Abrir alertas|`VistaAlertas`|`GestorAlertasPrecio`|Consulta sin mutación|
|**CU-11** Editar alerta|`VistaAlertas`|`GestorAlertasPrecio`|Actualización de `AlertaPrecio`|
|**CU-12** Eliminar alerta|`VistaAlertas`|`GestorAlertasPrecio`|Baja de `AlertaPrecio`|

</div>

### Diagrama parametrizado

<div align=center>

![Realización CRUD parametrizada](../../imagenes/capitulo3/analisis-R-CRUD.svg)

</div>

> El flujo alternativo "detalle global" del CU-07, que recupera información puntual de la L1 (saldos perpetuos, saldos spot, staking y últimas operaciones para una dirección), reutiliza `ConectorHyperliquid` con una consulta puntual — sin alterar la estructura general del patrón CRUD. Se documenta como variación del controlador `GestorCatalogoEntidades` en el [diseño de los CdU](disenoCdU.md).
