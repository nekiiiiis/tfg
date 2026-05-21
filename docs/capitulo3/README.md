# Capítulo 3 — Análisis y Diseño

## ¿Qué?

Tercer capítulo del TFG: aplica las disciplinas RUP de **Análisis** y **Diseño** sobre los actores, casos de uso y requisitos identificados en la disciplina anterior, llegando hasta una arquitectura técnica concreta lista para ser implementada.

## ¿Por qué?

Habiendo acordado los límites de la solución y el comportamiento esperado, toca refinar esos requisitos en una abstracción comprensible y mantenible y, a continuación, materializarla con decisiones técnicas trazables a los requisitos no funcionales del sistema.

## ¿Para qué?

- Refinar los casos de uso en colaboraciones de objetos identificables y comunicables.
- Descomponer el sistema en subsistemas con responsabilidad acotada y dependencias controladas.
- Materializar la arquitectura, las clases, los datos y el despliegue con tecnologías concretas justificadas frente a los requisitos suplementarios.
- Dejar el sistema listo para entrar en la disciplina de implementación con un esqueleto técnico estable.

## ¿Cómo?

Aplicando, en orden, las cuatro actividades RUP de análisis y las seis de diseño. Cada actividad parte del artefacto inmediatamente anterior y produce uno o varios diagramas y tablas que se enlazan desde aquí.

### Análisis

<div align=center>

|||
|-|-|
|[Analizar la arquitectura](analisisArquitectura.md)|Subsistemas, dependencias y vista lógica preliminar|
|[Analizar los casos de uso](analisisCdU.md)|Realizaciones `R(CU-XX)` con clases `<<boundary>>`, `<<control>>` y `<<entity>>`|
|[Analizar las clases](analisisClases.md)|Catálogo de clases de análisis por área funcional|
|[Analizar los paquetes](analisisPaquetes.md)|Agrupación cohesiva de clases y dependencias entre paquetes|

</div>

### Diseño

<div align=center>

|||
|-|-|
|[Diseñar la arquitectura](disenoArquitectura.md)|Capas, puerto hexagonal, mecanismos de comunicación y selección tecnológica|
|[Diseñar los casos de uso](disenoCdU.md)|Realizaciones de diseño con clases concretas y mensajes tipados|
|[Diseñar las clases](disenoClases.md)|Servicios, adaptadores, gateways y tipos del dominio|
|[Diseñar los paquetes](disenoPaquetes.md)|Estructura física de directorios y dependencias entre módulos|
|[Modelar los datos](modeloDeDatos.md)|Esquema lógico y físico de la base de datos|
|[Diseñar el despliegue](despliegue.md)|Topología de contenedores, redes, volúmenes y variables de entorno|

</div>

### Profundidad por caso de uso

Los CdU se realizan con dos niveles de detalle según su prioridad y riesgo técnico:

<div align=center>

|Nivel|CdU|Motivación|
|-|-|-|
|**Detallado**|CU-01, CU-09, CU-13, CU-14|Concentran el riesgo técnico (flujo continuo desde la L1, evaluación reactiva, integración HTTP externa)|
|**Por patrón CRUD**|CU-02 a CU-08, CU-10 a CU-12|Comparten estructura: el detalle se concentra en un único diagrama parametrizable, evitando repetir 11 secuencias idénticas|

</div>

> Los diagramas UML se encuentran en [/modelosUML/capitulo3](/modelosUML/capitulo3) (fuentes PlantUML) y las imágenes renderizadas en [/imagenes/capitulo3](/imagenes/capitulo3).
