# Actores y casos de uso

## Actores

<div align=center>

|Actor|Tipo|Descripción|
|-|-|-|
|**Usuario**|Primario|Operador de Infinite Fieldx que consulta el leaderboard, gestiona entidades y configura alertas de precio.|
|**Hyperliquid L1**|Externo (proveedor)|Fuente de datos de mercado: precios, operaciones y actividad de direcciones. Interacciona con el sistema enviando el flujo de eventos que habilita tanto la visualización del leaderboard como la evaluación de alertas.|
|**Servicio Webhook**|Externo (receptor)|Endpoint HTTP proporcionado por el Usuario como destino de las notificaciones disparadas por el sistema.|

</div>

> Los actores representan **roles**, no entidades concretas. Un mismo endpoint HTTP podría ejercer el rol de *Servicio Webhook* para múltiples alertas, igual que un mismo validador de la L1 ejerce el rol de *Hyperliquid L1* de cara al sistema.

## Criterios de identificación de casos de uso

Se aplica el patrón **atómico CRUD** recomendado por la metodología: cada entidad del modelo del dominio candidata a ser gestionada por un actor da lugar a un conjunto de casos de uso independientes para crear, abrir (listar y filtrar), editar y eliminar sus instancias.

<div align=center>

|||
|-|-|
|**Atomicidad**|Cada CdU representa una conversación completa y autónoma entre actor y sistema, con un resultado observable único.|
|**Trazabilidad**|Cada CdU se corresponde con una operación directamente ejecutable sobre una entidad del modelo del dominio.|
|**Cobertura sistemática**|Aplicar CRUD a cada entidad garantiza no dejar fuera operaciones por omisión.|
|**Identificación unívoca**|Cada CdU recibe un código `CU-XX` que facilita las referencias cruzadas con las disciplinas de análisis, diseño, implementación y pruebas.|

</div>

## Catálogo de casos de uso

Los casos de uso se presentan agrupados por cohesión funcional según el dominio sobre el que actúan. La numeración `CU-XX` es correlativa dentro de cada agrupación siguiendo el patrón CRUD (crear → abrir → editar → eliminar).

### Leaderboard

<div align=center>

|ID|Nombre|Actor(es)|Objetivo|
|-|-|-|-|
|**CU-01**|Consultar leaderboard|Usuario, Hyperliquid L1|Obtener la clasificación de direcciones por volumen de compra y venta para un mercado, token y temporalidad dados, resolviendo los nombres de las entidades conocidas.|

</div>

### Entidades

<div align=center>

|ID|Nombre|Actor|Objetivo|
|-|-|-|-|
|**CU-02**|Crear entidad|Usuario|Registrar una nueva entidad en el sistema con un nombre.|
|**CU-03**|Abrir entidades|Usuario|Listar y filtrar las entidades registradas.|
|**CU-04**|Editar entidad|Usuario|Modificar el nombre de una entidad existente.|
|**CU-05**|Eliminar entidad|Usuario|Dar de baja una entidad y su vínculo con sus direcciones.|

</div>

### Direcciones

<div align=center>

|ID|Nombre|Actor|Objetivo|
|-|-|-|-|
|**CU-06**|Añadir dirección|Usuario|Asociar una dirección pública a una entidad.|
|**CU-07**|Abrir direcciones|Usuario|Listar y filtrar las direcciones asociadas a una entidad.|
|**CU-08**|Eliminar dirección|Usuario|Desvincular una dirección de la entidad a la que pertenece.|

</div>

### Alertas

<div align=center>

|ID|Nombre|Actor|Objetivo|
|-|-|-|-|
|**CU-09**|Crear alerta de precio|Usuario|Registrar una alerta que vigilará el precio de un token respecto a un umbral y notificará a un webhook cuando se cumpla la condición.|
|**CU-10**|Abrir alertas de precio|Usuario|Listar y filtrar las alertas de precio registradas.|
|**CU-11**|Editar alerta de precio|Usuario|Modificar los parámetros (token, umbral, webhook) de una alerta existente.|
|**CU-12**|Eliminar alerta de precio|Usuario|Dar de baja una alerta, cesando su vigilancia.|

</div>

### Evaluación automática

<div align=center>

|ID|Nombre|Actor|Objetivo|
|-|-|-|-|
|**CU-13**|Evaluar alertas activas|Hyperliquid L1|Ante cada actualización de precio recibida desde la L1, comprobar las alertas vigentes del token afectado y disparar las que cumplan su condición.|
|**CU-14**|Enviar notificación|Servicio Webhook|Construir y transmitir al webhook receptor la notificación correspondiente a una alerta disparada, y rearmar la alerta tras la confirmación.|

</div>

## Diagrama de casos de uso

<div align=center>

![Diagrama de casos de uso](../../imagenes/capitulo2/casosDeUso.svg)

</div>

> El diagrama estructurado, junto con las relaciones `<<include>>` y `<<extend>>` entre CdU, se presenta en [Estructurar el modelo de CdU](estructuraCdU.md).
