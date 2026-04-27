# Priorización de casos de uso

## Criterios aplicados

> *"Primero, los de más riesgo"*

Se priorizan los CdU según una combinación de los siguientes factores, con el riesgo técnico como criterio principal al estar el proyecto en fase de Elaboración de RUP:

<div align=center>

|Criterio|Aplicación en este proyecto|
|-|-|
|**Riesgo técnico**|Los CdU que dependen de flujo continuo de datos desde la L1 o de integraciones externas concentran la incertidumbre técnica del proyecto.|
|**Contribución a la arquitectura**|Los CdU que validan los componentes núcleo (conexión con Hyperliquid, motor de evaluación, emisor de notificaciones) dirigen las decisiones arquitectónicas.|
|**Dependencias**|CdU que actúan como prerrequisito para que otros puedan ejercitarse (es necesario *crear* una alerta antes de poder *evaluarla*).|
|**Valor para el negocio**|Funcionalidades directamente demandadas por Infinite Fieldx según se recoge en la introducción del Capítulo 1.|
|**Visibilidad**|Capacidad del CdU de evidenciar progreso ante el cliente en una demostración temprana.|

</div>

## Ordenación

<div align=center>

|Prioridad|ID|CdU|Área|Riesgo técnico|Valor de negocio|Justificación|
|-|-|-|-|-|-|-|
|1|**CU-01**|Consultar leaderboard|Leaderboard|Alto|Muy alto|Núcleo de la funcionalidad del sistema. Consume el flujo continuo de Hyperliquid y valida la arquitectura de ingestión en tiempo real.|
|2|**CU-13**|Evaluar alertas activas|Evaluación|Alto|Alto|Segundo consumidor crítico del flujo de datos de la L1. Establece el mecanismo de reacción ante eventos de mercado.|
|3|**CU-14**|Enviar notificación|Evaluación|Medio|Alto|Integración con un endpoint HTTP externo — riesgo de latencia, errores de red, códigos de respuesta inesperados.|
|4|**CU-09**|Crear alerta de precio|Alertas|Medio|Alto|Precondición para que CU-13 tenga trabajo que hacer; valida la persistencia de alertas.|
|5|**CU-02**|Crear entidad|Entidades|Bajo|Medio|Precondición para que CU-01 muestre nombres resueltos en lugar de direcciones opacas.|
|6|**CU-06**|Añadir dirección|Direcciones|Bajo|Medio|Precondición para que las entidades tengan contenido útil.|
|7|**CU-10**|Abrir alertas de precio|Alertas|Bajo|Medio|Permite revisar el estado de las alertas registradas.|
|8|**CU-03**|Abrir entidades|Entidades|Bajo|Medio|Permite revisar el catálogo de entidades conocidas.|
|9|**CU-07**|Abrir direcciones|Direcciones|Bajo|Medio|Completa la navegación sobre una entidad concreta.|
|10|**CU-11**|Editar alerta de precio|Alertas|Bajo|Bajo|Mantenimiento — ajuste de parámetros sobre alertas ya operativas.|
|11|**CU-04**|Editar entidad|Entidades|Bajo|Bajo|Mantenimiento — renombrado de entidades.|
|12|**CU-12**|Eliminar alerta de precio|Alertas|Bajo|Bajo|Mantenimiento — baja de alertas obsoletas.|
|13|**CU-08**|Eliminar dirección|Direcciones|Bajo|Bajo|Mantenimiento — desvinculación puntual de direcciones.|
|14|**CU-05**|Eliminar entidad|Entidades|Bajo|Bajo|Mantenimiento — baja de entidades.|

</div>

## Agrupación por iteraciones

La priorización anterior se traduce en la siguiente asignación a iteraciones de la fase de Construcción:

<div align=center>

|Iteración|CdU incluidos|Objetivo de la iteración|
|-|-|-|
|**It. 1 — Núcleo en tiempo real**|CU-01|Validar la ingestión desde la L1 y la visualización básica del leaderboard.|
|**It. 2 — Alertas extremo a extremo**|CU-09, CU-13, CU-14|Demostrar el circuito completo desde la configuración de una alerta hasta la notificación al webhook.|
|**It. 3 — Enriquecimiento del leaderboard**|CU-02, CU-06, CU-03, CU-07|Permitir que el leaderboard muestre nombres de entidades en lugar de direcciones.|
|**It. 4 — Mantenimiento y cierre**|CU-10, CU-11, CU-04, CU-12, CU-08, CU-05|Completar los CdU de mantenimiento y cerrar la cobertura funcional.|

</div>
