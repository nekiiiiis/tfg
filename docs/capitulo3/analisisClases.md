# Análisis de clases

Agrupa, refina y describe las **clases de análisis** participantes en las realizaciones de los CdU. Construye un vocabulario común — independiente de la tecnología — sobre el que se apoyará el diseño.

## Criterios de identificación

Se combinan las cuatro estrategias del temario de Ingeniería del Software (análisis del dominio, análisis del comportamiento, análisis de casos de uso y análisis clásico) y se aplican las reglas de la metodología para los tres estereotipos:

<div align=center>

|Estereotipo|Regla de identificación|
|-|-|
|`<<entity>>`|Una por concepto del modelo del dominio, más las entidades **derivadas** que aparezcan al razonar sobre el flujo (caso de `LeaderboardEnVivo`).|
|`<<boundary>>`|Una **primaria** por actor humano (la ventana principal con la que dialoga); una **primitiva** por entidad expuesta al usuario (formularios y listados); una **central** por actor-sistema externo (interfaz de comunicaciones).|
|`<<control>>`|Una por caso de uso, refinada o agrupada cuando varios CdU homogéneos comparten el mismo escenario (caso de los gestores CRUD).|

</div>

## Catálogo

### Clases `<<entity>>` (dominio)

<div align=center>

|Clase|Atributos|Invariantes / Estados|Origen|
|-|-|-|-|
|`Entidad`|`id`, `nombre`|Nombre único; nombre no vacío|MdD|
|`Direccion`|`valor`, `entidad`|`valor` con formato `0x[a-f0-9]{40}`; única; pertenece a una `Entidad`|MdD|
|`AlertaPrecio`|`mercado`, `token`, `umbral`, `webhook`, `estado`|`umbral.valor > 0`; estado del ciclo de vida (ver más abajo)|MdD|
|`Notificacion`|`alerta`, `precioDisparador`, `instanteEmision`, `estado`|`precioDisparador > 0`; estados de entrega (ver más abajo)|MdD|
|`Webhook`|`url`|URL no legible fuera del subsistema (RS-10)|MdD|
|`Umbral`|`cruce` (`SUBE`/`BAJA`), `valor`|`valor > 0`|MdD|
|`Operacion`|`mercado`, `token`, `direccion`, `volumenUsd`, `lado` (`BUY`/`SELL`), `instante`, `tid?`|`volumenUsd > 0`; `tid` identifica la operación de forma única en su mercado|MdD|
|`Precio`|`token`, `valor`, `instante`|`valor > 0`|MdD|
|`Mercado`|`tipo` (`Spot`/`PerpNativo`/`PerpHIP3`)|—|MdD|
|`Token`|`id`, `mercado`, `base`, `quote?`, `dex?`|Combinación `(mercado, id)` única|MdD|
|`LeaderboardEnVivo`|`mercado`, `token`, `temporalidad`, agregado por dirección con `volumenCompra` y `volumenVenta`|Suma deslizante sobre la ventana de la temporalidad; reconstruible a partir del flujo de `Operacion`|Entidad derivada (introducida por el análisis para razonar sobre el flujo continuo)|

</div>

#### Estados del ciclo de vida

`AlertaPrecio` y `Notificacion` mantienen los estados ya identificados en el modelo del dominio. El análisis de clases hereda esas transiciones sin alterarlas:

- `AlertaPrecio`: `OPERATIVA` ⇄ `DISPARADA` (y `DISPARADA` → `NOTIFICACION_FALLIDA` ante fallo no recuperable a corto plazo del webhook).
- `Notificacion`: `PENDIENTE` → `ENTREGADA` o `PENDIENTE` ⇆ `FALLIDA` (con reintento).

### Clases `<<boundary>>` (frontera)

<div align=center>

|Clase|Tipo|Actor con el que interactúa|Función|
|-|-|-|-|
|`VistaLeaderboard`|Primaria|Usuario|Selección de mercado/token/temporalidad y presentación reactiva de la clasificación|
|`VistaEntidades`|Primaria|Usuario|Lista de entidades, alta, edición, baja; entrada al detalle de direcciones; entrada al detalle global de una dirección|
|`VistaAlertas`|Primaria|Usuario|Lista de alertas, alta, edición y baja|
|`ConectorHyperliquid`|Central|Hyperliquid L1|Recepción del flujo continuo de operaciones y precios; consultas puntuales (saldos, fills, staking) para el flujo alternativo del CU-07|
|`ConectorWebhook`|Central|Servicio Webhook|Verificación de alcanzabilidad y transmisión de notificaciones|

</div>

> Las vistas primitivas (formulario de creación de entidad, formulario de alerta…) se identifican como **partes** de la vista primaria correspondiente, no como clases separadas. Esta simplificación es coherente con el bajo número de entidades expuestas al Usuario.

### Clases `<<control>>` (controladores de CdU)

<div align=center>

|Clase|Casos de uso que coordina|Subsistema|Colaboradores|
|-|-|-|-|
|`GestorConsultaLeaderboard`|CU-01|S-LEAD|`ConectorHyperliquid`, `GestorCatalogoEntidades`, `LeaderboardEnVivo`|
|`GestorCatalogoEntidades`|CU-02, CU-03, CU-04, CU-05, CU-06, CU-07, CU-08|S-CATA|`Entidad`, `Direccion`, `ConectorHyperliquid` *(flujo alternativo de CU-07)*|
|`GestorAlertasPrecio`|CU-09, CU-10, CU-11, CU-12|S-ALER|`AlertaPrecio`, `ConectorWebhook` *(check)*|
|`GestorEvaluacionAlertas`|CU-13|S-EVAL|`GestorAlertasPrecio` *(consulta)*, `GestorEnvioNotificacion` *(`<<include>>`)*|
|`GestorEnvioNotificacion`|CU-14|S-NOTI|`Notificacion`, `ConectorWebhook`|

</div>

## Diagramas por área

Se presentan agrupados por subsistema; el grafo global se incluyó en el [análisis de los CdU](analisisCdU.md#diagrama-global).

### Área Leaderboard (S-LEAD + S-INGE)

<div align=center>

![Clases de análisis — Leaderboard](../../imagenes/capitulo3/analisis-clases-leaderboard.svg)

</div>

`LeaderboardEnVivo` es la entidad central del subsistema. `GestorConsultaLeaderboard` la mantiene actualizada en respuesta a `OperacionRecibida` (emitido por `ConectorHyperliquid`) y la presenta a `VistaLeaderboard`. La colaboración con `GestorCatalogoEntidades` resuelve nombres de entidades para las direcciones presentes.

### Área Catálogo (S-CATA)

<div align=center>

![Clases de análisis — Catálogo](../../imagenes/capitulo3/analisis-clases-catalogo.svg)

</div>

`GestorCatalogoEntidades` es el único controlador del subsistema, coordinando los siete CdU CRUD de `Entidad` y `Direccion`. Las dos clases del dominio se relacionan con multiplicidad `1..* — 1` (una entidad agrupa direcciones; una dirección pertenece a una sola entidad).

### Área Alertas (S-ALER)

<div align=center>

![Clases de análisis — Alertas](../../imagenes/capitulo3/analisis-clases-alertas.svg)

</div>

`GestorAlertasPrecio` orquesta el ciclo de vida de `AlertaPrecio`. La interacción con `ConectorWebhook` es puntual y opcional en CU-09/CU-11 (verificación de alcanzabilidad).

### Área Evaluación + Notificación (S-EVAL + S-NOTI)

<div align=center>

![Clases de análisis — Evaluación y Notificación](../../imagenes/capitulo3/analisis-clases-evaluacion.svg)

</div>

`GestorEvaluacionAlertas` reacciona al evento `PrecioActualizado` y, cuando una alerta cumple su umbral, delega en `GestorEnvioNotificacion`. Este último materializa cada disparo como una `Notificacion`, custodia su estado de entrega y dialoga con `ConectorWebhook` para la transmisión efectiva.

## Decisiones de análisis con impacto en el diseño

La identificación de las clases anteriores fija varias decisiones de análisis que el diseño desarrollará:

<div align=center>

|Decisión|Justificación|Impacto en diseño|
|-|-|-|
|**Frontera única con la L1** (`ConectorHyperliquid`)|RS-08 exige sustituibilidad de la fuente sin afectar al resto del sistema|Se materializa como **puerto** (interfaz) con varios adaptadores intercambiables (ver [disenoArquitectura](disenoArquitectura.md))|
|**Resolución de nombres como consulta entre subsistemas**|Mantiene a `GestorConsultaLeaderboard` ignorante del modelo de catálogo|Aparecerá como dependencia hacia una interfaz de consulta del catálogo|
|**`LeaderboardEnVivo` como entidad derivada**|Datos reconstruibles, no transaccionales; el almacenamiento durable es ortogonal a la responsabilidad de S-LEAD|Se materializa como **estado en memoria** del proceso, con persistencia opcional para ventanas largas|
|**`Notificacion` independiente de `AlertaPrecio`**|Trazabilidad histórica (RS-09) y mecanismo de reintento (RS-07)|Cada disparo genera una fila, no se actualiza la alerta|
|**Estados explícitos en `AlertaPrecio` y `Notificacion`**|Permite máquinas de estado simples y consultas indexadas|Modelado como `enum` Postgres en el [modelo de datos](modeloDeDatos.md)|

</div>
