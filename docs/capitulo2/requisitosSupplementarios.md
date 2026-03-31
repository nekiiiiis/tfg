# Requisitos suplementarios

Los requisitos suplementarios recogen las propiedades del sistema que no se expresan mediante casos de uso funcionales sino que afectan transversalmente a toda la solución.

<div align=center>

|ID|Categoría|Descripción|
|-|-|-|
|RS-01|Rendimiento|Los volúmenes del leaderboard deben actualizarse en tiempo real con una latencia inferior a 1 segundo desde la recepción de la operación.|
|RS-02|Rendimiento|Las alertas de precio deben evaluarse con una frecuencia que permita detectar el traspaso del umbral en menos de 2 segundos.|
|RS-03|Disponibilidad|El sistema debe operar de forma continua 24/7, dado que los mercados de criptomonedas no tienen horario de cierre.|
|RS-04|Extensibilidad|La arquitectura debe ser modular para permitir la incorporación futura de nuevas herramientas (por ejemplo, monitorización de protocolos HyperEVM) y nuevos tipos de alertas sin modificar los módulos existentes.|
|RS-05|Usabilidad|La interfaz se organiza en tres pestañas claramente diferenciadas (Leaderboard, Entidades, Alertas), de modo que el usuario pueda acceder a todas las funcionalidades sin necesidad de múltiples plataformas.|
|RS-06|Usabilidad|El leaderboard presenta tres cuadros separados visualmente —Spot, Perps nativos y Perps HIP-3— para que el usuario distinga rápidamente el tipo de mercado.|
|RS-07|Fiabilidad|Las notificaciones fallidas (error de webhook) deben reintentarse automáticamente y la alerta debe quedar en estado de error visible para el usuario.|
|RS-08|Escalabilidad|El diseño debe contemplar la posibilidad de sustituir el acceso vía API pública por un nodo no validador para eliminar los límites de tasa cuando el volumen de datos lo requiera.|

</div>
