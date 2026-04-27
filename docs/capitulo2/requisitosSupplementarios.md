# Requisitos suplementarios

Requisitos no funcionales del sistema, organizados por categoría según la plantilla de la metodología.

<div align=center>

|ID|Categoría|Descripción|
|-|-|-|
|**RS-01**|Rendimiento|El leaderboard debe reflejar las nuevas operaciones procedentes de Hyperliquid L1 con una latencia no superior a un segundo.|
|**RS-02**|Rendimiento|Las alertas operativas deben ser evaluadas en un plazo no superior a dos segundos desde la recepción de la actualización de precio correspondiente.|
|**RS-03**|Disponibilidad|El sistema debe operar de forma continua 24/7, en coherencia con la naturaleza ininterrumpida del mercado de criptoactivos.|
|**RS-04**|Extensibilidad|La arquitectura debe permitir incorporar nuevas herramientas de análisis (más allá del leaderboard) y nuevos tipos de alertas (más allá de alertas de precio) sin alterar las existentes.|
|**RS-05**|Usabilidad|Las tres áreas funcionales del sistema —consulta del leaderboard, gestión de entidades y gestión de alertas— deben ser accesibles de forma independiente y sin interferencias mutuas, de modo que una operación de gestión no interrumpa la monitorización en tiempo real.|
|**RS-06**|Usabilidad|La consulta del leaderboard debe permitir al Usuario distinguir los tres tipos de mercado (Spot, PerpNativo, PerpHIP3) sin mezclar datos entre ellos.|
|**RS-07**|Fiabilidad|Las notificaciones cuya entrega al webhook falle deben reintentarse de forma automática hasta confirmación o agotamiento de un número configurable de intentos.|
|**RS-08**|Escalabilidad|La obtención de datos de Hyperliquid debe poder sustituirse desde la API pública a un nodo no validador sin que ello afecte al resto del sistema.|
|**RS-09**|Trazabilidad|Toda notificación enviada al webhook debe quedar registrada asociada a la alerta que la originó y al precio que disparó su emisión.|
|**RS-10**|Seguridad|Las direcciones de webhook almacenadas no deben ser legibles desde interfaces de consulta ajenas a su gestión.|

</div>
