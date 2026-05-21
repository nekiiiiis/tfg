# Análisis de paquetes

Agrupa las clases del análisis en **paquetes cohesivos** y establece las dependencias entre ellos: paquetes con alta cohesión interna, bajo acoplamiento entre sí y un grafo de dependencias acíclico.

## Criterios

<div align=center>

|Criterio|Aplicación|
|-|-|
|**Cohesión funcional**|Cada paquete agrupa clases que colaboran para realizar un mismo grupo de CdU. La división coincide con los subsistemas del [análisis de la arquitectura](analisisArquitectura.md).|
|**Bajo acoplamiento**|Las dependencias entre paquetes se reducen a operaciones de consulta o a la propagación de eventos. Ningún paquete accede a estructuras internas de otro.|
|**Tamaño**|Paquetes lo bastante pequeños para describirlos en uno o dos diagramas y comprenderlos de un vistazo.|
|**Aciclicidad**|El grafo de paquetes es un DAG. Las posibles dependencias cíclicas se rompen mediante eventos del dominio.|

</div>

## Paquetes identificados

<div align=center>

|Paquete|Clases que contiene|Subsistema asociado|Tamaño|
|-|-|-|-|
|`presentacion`|`VistaLeaderboard`, `VistaEntidades`, `VistaAlertas`|S-PRES|3|
|`ingestion`|`ConectorHyperliquid`|S-INGE|1|
|`leaderboard`|`GestorConsultaLeaderboard`, `LeaderboardEnVivo`|S-LEAD|2|
|`catalogo`|`GestorCatalogoEntidades`|S-CATA|1|
|`alertas`|`GestorAlertasPrecio`|S-ALER|1|
|`evaluacion`|`GestorEvaluacionAlertas`|S-EVAL|1|
|`notificacion`|`GestorEnvioNotificacion`, `ConectorWebhook`|S-NOTI|2|
|`dominio`|`Mercado`, `Token`, `Precio`, `Operacion`, `Direccion`, `Entidad`, `AlertaPrecio`, `Webhook`, `Umbral`, `Notificacion`|*compartido*|10|

</div>

> El paquete `dominio` agrupa todas las clases `<<entity>>` reutilizables. Su existencia como paquete único de análisis simplifica el discurso del capítulo; en el [diseño de paquetes](disenoPaquetes.md) se discute si conviene descomponerlo por agregado o mantenerlo monolítico.

## Dependencias

Las dependencias entre paquetes están dirigidas por la dirección de la información:

<div align=center>

|Dependencia|Naturaleza|Motivación|
|-|-|-|
|`presentacion` → `leaderboard`, `catalogo`, `alertas`|Llamadas a controladores|Cada vista delega en el gestor de su CdU|
|`leaderboard` → `ingestion`|Suscripción a eventos|`GestorConsultaLeaderboard` consume `OperacionRecibida`|
|`leaderboard` → `catalogo`|Consulta puntual|Resolución de nombres de entidad para direcciones|
|`evaluacion` → `ingestion`|Suscripción a eventos|`GestorEvaluacionAlertas` consume `PrecioActualizado`|
|`evaluacion` → `alertas`|Consulta puntual|Recuperación de alertas operativas para un token|
|`evaluacion` → `notificacion`|`<<include>>` de CU-13 a CU-14|Delegación del envío al disparar la alerta|
|`alertas` → `notificacion`|Consulta puntual|Verificación de alcanzabilidad del webhook (CU-09, CU-11)|
|*todos los anteriores* → `dominio`|`<<use>>`|Las entidades del dominio son vocabulario común|

</div>

<div align=center>

![Paquetes de análisis](../../imagenes/capitulo3/analisis-paquetes.svg)

</div>

## Verificación

### Aciclicidad

El grafo descrito es un DAG: las dependencias circulares potenciales (p. ej. `evaluacion` ↔ `notificacion`) están rotas por la dirección de `<<include>>` de CdU; las posibles consultas inversas (notificación que necesita información de la alerta) se canalizan a través de `dominio` sin romper la jerarquía.

### Cohesión interna

Cada paquete coincide con un subsistema; toda clase pertenece al paquete que coordina los CdU en los que participa principalmente. Las clases `<<entity>>` compartidas se concentran en `dominio` para evitar replicación.

### Acoplamiento entre paquetes

Las dependencias son siempre de una de estas dos clases:

- **Por interfaz de consulta**: el paquete dependiente conoce únicamente las operaciones que necesita (resolución de nombres, búsqueda de alertas operativas), no la estructura interna del paquete consultado. Esto encaja con el principio de segregación de interfaces (ISP).
- **Por eventos del dominio**: el paquete que publica el evento ignora a sus consumidores. Esto rompe el acoplamiento estructural entre productor y consumidor y materializa el principio de inversión de dependencias (DIP) a nivel de paquete.

## Decisiones que pasan al diseño

El [diseño de paquetes](disenoPaquetes.md) recogerá las siguientes decisiones:

<div align=center>

|Decisión|Discusión que abre|
|-|-|
|Posible descomposición de `dominio` por agregado (entidad, alerta, leaderboard, notificación)|Disminuye el tamaño del paquete y aproxima la estructura a la implementación|
|Introducción de paquetes `aplicacion` e `infraestructura`|Permite distinguir la lógica de los CdU (servicios) de los detalles tecnológicos (adaptadores, persistencia, gateways)|
|Tratamiento del bus de eventos como utilidad transversal|No es responsabilidad de ningún paquete de análisis; el diseño decidirá su ubicación|

</div>
