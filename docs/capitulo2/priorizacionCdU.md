# Priorización de casos de uso

Los casos de uso se priorizan según cuatro criterios: riesgo técnico, contribución a la arquitectura, valor de negocio y dependencias con otros casos de uso.

<div align=center>

|Prioridad|CdU|Nombre|Riesgo técnico|Valor de negocio|Justificación|
|-|-|-|-|-|-|
|1|CU-01|Consultar leaderboard|Alto|Muy alto|Página principal de la aplicación. Requiere suscripción WebSocket, cálculo de volúmenes en tiempo real y resolución de nombres de entidades. Mayor contribución a la arquitectura.|
|2|CU-04|Configurar alerta|Medio|Alto|Arquitectónicamente significativo: define el modelo de alerta que luego será evaluado continuamente. Implica validación de datos y persistencia.|
|3|CU-06|Evaluar alertas|Medio|Alto|Depende de CU-04. Ciclo continuo de comparación precio versus umbral. Riesgo técnico por la evaluación en tiempo real.|
|4|CU-07|Enviar notificación|Medio|Alto|Depende de CU-06. Integración con sistemas externos vía HTTP. Gestión de errores y reintentos.|
|5|CU-02|Crear entidad|Bajo|Medio|CRUD necesario para que el leaderboard muestre nombres en lugar de direcciones crudas.|
|6|CU-03|Gestionar entidades|Bajo|Medio|CRUD complementario a CU-02. Bajo riesgo.|
|7|CU-05|Gestionar alertas|Bajo|Medio|CRUD sobre alertas ya creadas. Menor riesgo y dependencia directa de CU-04.|

</div>
