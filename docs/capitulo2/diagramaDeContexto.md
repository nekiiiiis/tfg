# Diagrama de contexto

## Propósito

El diagrama de contexto representa **la perspectiva del Usuario** sobre el sistema como una máquina de estados: cada caso de uso atómico es una transición entre estados del sistema desde el punto de vista del actor. Esta representación:

<div align=center>

|||
|-|-|
|**Hace explícitas las precondiciones**|Sin necesidad de texto adicional: si un CdU no tiene transición entrante desde un estado, no puede invocarse desde ese estado.|
|**Valida la completitud**|Todos los CdU identificados deben aparecer como transiciones en alguna parte del diagrama; cualquier CdU ausente es un indicio de omisión o de redundancia.|
|**Define la navegación**|Muestra cómo el Usuario transita entre las áreas funcionales del sistema sin adelantar decisiones de presentación.|

</div>

## Estados del sistema

<div align=center>

|Estado|Descripción|
|-|-|
|**SISTEMA_DISPONIBLE**|Estado inicial y hub central de navegación. Punto de acceso a las tres áreas funcionales.|
|**LEADERBOARD_ABIERTO**|El sistema mantiene al Usuario en la clasificación en tiempo real.|
|**ENTIDADES_ABIERTAS**|Relación de entidades registradas. Punto de entrada a las operaciones sobre una entidad concreta.|
|**ENTIDAD_ABIERTA**|Edición de una entidad concreta. Punto de acceso al contexto de sus direcciones.|
|**DIRECCIONES_ABIERTAS**|Relación de direcciones asociadas a una entidad. Sub-contexto accesible desde `ENTIDAD_ABIERTA`.|
|**ALERTAS_ABIERTAS**|Relación de alertas registradas.|
|**ALERTA_ABIERTA**|Edición de una alerta concreta.|

</div>

## Transiciones

<div align=center>

|Origen|ID|CdU|Destino|
|-|-|-|-|
|SISTEMA_DISPONIBLE|CU-01|Consultar leaderboard|LEADERBOARD_ABIERTO|
|SISTEMA_DISPONIBLE|CU-03|Abrir entidades|ENTIDADES_ABIERTAS|
|SISTEMA_DISPONIBLE|CU-10|Abrir alertas de precio|ALERTAS_ABIERTAS|
|ENTIDADES_ABIERTAS|CU-02|Crear entidad|ENTIDAD_ABIERTA|
|ENTIDADES_ABIERTAS|CU-04|Editar entidad|ENTIDAD_ABIERTA|
|ENTIDADES_ABIERTAS|CU-05|Eliminar entidad|ENTIDADES_ABIERTAS *(in situ)*|
|ENTIDAD_ABIERTA|CU-07|Abrir direcciones|DIRECCIONES_ABIERTAS|
|DIRECCIONES_ABIERTAS|CU-06|Añadir dirección|DIRECCIONES_ABIERTAS *(in situ)*|
|DIRECCIONES_ABIERTAS|CU-08|Eliminar dirección|DIRECCIONES_ABIERTAS *(in situ)*|
|ALERTAS_ABIERTAS|CU-09|Crear alerta de precio|ALERTA_ABIERTA|
|ALERTAS_ABIERTAS|CU-11|Editar alerta de precio|ALERTA_ABIERTA|
|ALERTAS_ABIERTAS|CU-12|Eliminar alerta de precio|ALERTAS_ABIERTAS *(in situ)*|

</div>

## Diagrama

<div align=center>

![Diagrama de contexto — Usuario](../../imagenes/capitulo2/diagramaDeContexto.svg)

</div>

## Perspectiva de los actores externos

Los actores externos Hyperliquid L1 y Servicio Webhook no navegan por estados del sistema: son fuente y destino de flujos de datos respectivamente. Sus interacciones quedan cubiertas por los CdU CU-01 (Hyperliquid L1 como proveedor continuo), CU-13 (Hyperliquid L1 como disparador) y CU-14 (Servicio Webhook como receptor), cuyo detalle y diagramas de secuencia/actividad se encuentran en [Detallar casos de uso](detalleCdU.md).
