# Análisis de la arquitectura

Descomposición del sistema en **subsistemas con responsabilidad acotada**, sus dependencias y el reparto de casos de uso entre ellos. El resultado es una abstracción tecnológicamente neutra: aún no se compromete framework, base de datos ni protocolos.

## Criterios de descomposición

<div align=center>

|Criterio|Aplicación en este sistema|
|-|-|
|**Cohesión funcional**|Cada subsistema cubre una agrupación lógica de CdU (leaderboard, catálogo, alertas, evaluación, notificación). Una operación pertenece a un único subsistema.|
|**Bajo acoplamiento**|Los subsistemas se comunican por interfaces explícitas (servicios) o por eventos del dominio (`OperacionRecibida`, `PrecioActualizado`, `AlertaDisparada`). Ningún subsistema accede a las estructuras internas de otro.|
|**Frontera estable**|Las dependencias hacia actores externos (Hyperliquid L1, Servicio Webhook) se concentran en subsistemas frontera, no se reparten por el núcleo. Esto soporta RS-08 (sustituibilidad de la fuente).|
|**Jerarquización**|Las dependencias forman un grafo acíclico: presentación → aplicación → dominio, con frontera en ingestión y notificación.|

</div>

## Subsistemas

<div align=center>

|ID|Nombre|Responsabilidad|Actor con el que dialoga|
|-|-|-|-|
|**S-PRES**|Presentación|Recibe las solicitudes del Usuario por HTTP y WebSocket, presenta resultados y mantiene la sesión de la interfaz.|Usuario|
|**S-INGE**|Ingestión|Mantiene el canal con Hyperliquid L1, recibe el flujo continuo de operaciones y precios, y los publica en el bus del dominio como eventos.|Hyperliquid L1|
|**S-LEAD**|Leaderboard|Mantiene la clasificación de direcciones por volumen para cada terna `(mercado, token, temporalidad)`, alimentándose del flujo de ingestión.|—|
|**S-CATA**|Catálogo|Gestiona las entidades y las direcciones que las identifican, y resuelve direcciones a nombres en el leaderboard.|—|
|**S-ALER**|Alertas|Gestiona las alertas de precio (CRUD) y custodia su estado.|—|
|**S-EVAL**|Evaluación|Comprueba, ante cada actualización de precio, si alguna alerta operativa debe dispararse.|—|
|**S-NOTI**|Notificación|Transmite las alertas disparadas al Servicio Webhook y reintenta las entregas fallidas.|Servicio Webhook|

</div>

<div align=center>

![Subsistemas](../../imagenes/capitulo3/analisis-subsistemas.svg)

</div>

## Reparto de casos de uso

<div align=center>

|CdU|Subsistema responsable|Otros subsistemas implicados|
|-|-|-|
|**CU-01** Consultar leaderboard|S-LEAD|S-PRES (vista), S-INGE (flujo), S-CATA (resolución de nombres)|
|**CU-02** Crear entidad|S-CATA|S-PRES|
|**CU-03** Abrir entidades|S-CATA|S-PRES|
|**CU-04** Editar entidad|S-CATA|S-PRES|
|**CU-05** Eliminar entidad|S-CATA|S-PRES|
|**CU-06** Añadir dirección|S-CATA|S-PRES|
|**CU-07** Abrir direcciones|S-CATA|S-PRES, S-INGE *(flujo alternativo "detalle global")*|
|**CU-08** Eliminar dirección|S-CATA|S-PRES|
|**CU-09** Crear alerta de precio|S-ALER|S-PRES, S-NOTI *(comprobación de alcanzabilidad del webhook)*|
|**CU-10** Abrir alertas de precio|S-ALER|S-PRES|
|**CU-11** Editar alerta de precio|S-ALER|S-PRES, S-NOTI|
|**CU-12** Eliminar alerta de precio|S-ALER|S-PRES|
|**CU-13** Evaluar alertas activas|S-EVAL|S-INGE *(flujo), S-ALER (consulta), S-NOTI (`<<include>>` CU-14)*|
|**CU-14** Enviar notificación|S-NOTI|—|

</div>

## Vista lógica preliminar

Combinando los subsistemas y los actores externos del sistema:

<div align=center>

![Vista lógica preliminar](../../imagenes/capitulo3/analisis-vistaLogica.svg)

</div>

## Mecanismos arquitectónicos identificados

El análisis identifica cuatro mecanismos transversales que el diseño deberá materializar con tecnología concreta.

### Comunicación con el exterior

El sistema dialoga con dos actores externos con cualidades muy distintas:

- **Hyperliquid L1**: actor *proveedor*, push-oriented. Envía un flujo continuo de operaciones y precios. La fidelidad y la latencia del leaderboard y de las alertas dependen de él. RS-01 y RS-02 imponen latencias inferiores a 1 y 2 segundos respectivamente.
- **Servicio Webhook**: actor *receptor*, pull-oriented desde la perspectiva del sistema: solo se le habla cuando una alerta dispara. Su disponibilidad no se controla; el sistema debe tolerar fallos y reintentar (RS-07).

### Propagación de eventos del dominio

S-INGE no conoce a sus consumidores (S-LEAD, S-EVAL). Publica eventos del dominio (`OperacionRecibida`, `PrecioActualizado`) en un bus interno; los subsistemas interesados se suscriben. Esto preserva el bajo acoplamiento y permite añadir nuevos consumidores sin modificar la ingestión (OCP).

### Persistencia y estado caliente

Hay dos categorías de datos:

- **Estado transaccional**: entidades, direcciones, alertas y notificaciones. Requiere durabilidad, integridad referencial y consultas indexadas. Lo gestionan S-CATA, S-ALER y S-NOTI.
- **Estado caliente del leaderboard**: agregaciones por dirección dentro de una ventana deslizante por terna. Recibe muchas escrituras por segundo y se consulta a la velocidad del refresco de la UI. Es responsabilidad de S-LEAD y se considera un dato derivado del flujo de operaciones — reconstruible si se pierde.

### Concurrencia y disponibilidad continua

RS-03 exige operación 24/7. El sistema debe soportar el flujo continuo de la L1 sin bloquear las operaciones del Usuario (RS-05). Esto implica que la evaluación de alertas (S-EVAL) debe ejecutarse fuera del camino crítico de las peticiones del Usuario, lo cual encaja con el mecanismo de eventos descrito antes.

## Trazabilidad con los requisitos suplementarios

<div align=center>

|Requisito|Subsistema(s) que lo concentran|Justificación|
|-|-|-|
|**RS-01** ≤ 1 s en leaderboard|S-INGE, S-LEAD|Pipeline directo desde el push de la L1 al estado en caliente, sin pasar por almacenamiento transaccional|
|**RS-02** ≤ 2 s en evaluación|S-INGE, S-EVAL, S-NOTI|Suscriptor de `PrecioActualizado` que consulta alertas indexadas por token y delega la entrega|
|**RS-03** 24/7|Todos|Procesos independientes; estado transaccional durable; estado caliente reconstruible|
|**RS-04** Extensibilidad|S-LEAD, S-ALER|Nuevas herramientas se añaden como nuevos consumidores del bus; nuevos tipos de alerta se materializan como nuevas implementaciones del evaluador|
|**RS-05** Áreas independientes|S-PRES|La interfaz separa leaderboard, gestión y alertas en contextos sin interferencias|
|**RS-06** Mercados distinguidos|S-LEAD, S-CATA|`mercado` es un atributo de primer orden de toda terna y de todo token|
|**RS-07** Reintentos|S-NOTI|Cola interna con política de backoff acumulada|
|**RS-08** Sustituibilidad de la fuente|S-INGE|Frontera bien definida; el resto del sistema desconoce el protocolo concreto|
|**RS-09** Trazabilidad|S-NOTI, S-ALER|Cada notificación se persiste asociada a su alerta y al precio que la disparó|
|**RS-10** Seguridad del webhook|S-ALER, S-NOTI|La URL del webhook no es legible fuera del propio subsistema|

</div>
