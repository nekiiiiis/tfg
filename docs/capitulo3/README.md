# Capítulo 3 — Análisis y diseño

## ¿Qué?

Tercer capítulo del TFG: aborda las disciplinas de **análisis** y **diseño** del Proceso Unificado, refinando los requisitos capturados en el Capítulo 2 hasta obtener una especificación interna del sistema lo bastante completa como para guiar la implementación sin ambigüedad.

<div align=center>

|Análisis|Diseño|
|-|-|
|Reescribir los requisitos en el lenguaje de los desarrolladores, identificar las clases y colaboraciones que realizan cada CdU, y validar que la arquitectura candidata los soporta.|Tomar decisiones técnicas concretas (lenguajes, frameworks, persistencia, despliegue) y refinar el modelo de análisis hasta el detalle necesario para implementar.|

</div>

## ¿Por qué?

Tras delimitar el sistema en el Capítulo 2 mediante CdU, modelo del dominio y requisitos suplementarios, queda pendiente la transición desde **qué** debe hacer el sistema a **cómo** lo hará. Sin ese refinamiento, la implementación quedaría sin criterio para repartir responsabilidades, dimensionar componentes ni acotar el coste del cambio.

## ¿Para qué?

Construir una abstracción sin fisuras de la implementación, de modo que el código sea un refinamiento mecánico del diseño. El esqueleto del sistema —arquitectura, paquetes, clases, contratos entre componentes— queda fijado aquí; el Capítulo 4 únicamente lo materializa.

## ¿Cómo?

Las disciplinas se ejecutan en dos pasadas, primero análisis y después diseño, y cada pasada cubre las cuatro mismas actividades:

<div align=center>

||Análisis|Diseño|
|:-:|-|-|
|✅|[Análisis de la arquitectura](analisisArquitectura.md)|[Diseño de la arquitectura](disenoArquitectura.md)|
|✅|[Análisis de los CdU](analisisCdU.md)|[Diseño de los CdU](disenoCdU.md)|
|✅|[Análisis de clases](analisisClases.md)|[Diseño de clases](disenoClases.md)|
|✅|[Análisis de paquetes](analisisPaquetes.md)|[Diseño de paquetes](disenoPaquetes.md)|
|✅|—|[Diagramas de despliegue](despliegue.md)|
|✅|—|[Modelo de datos](modeloDeDatos.md)|

</div>

> Las fuentes PlantUML se encuentran en [/modelosUML/capitulo3](/modelosUML/capitulo3) y las imágenes renderizadas en [/imagenes/capitulo3](/imagenes/capitulo3).

### Alcance del capítulo

Por priorización (ver [Priorización de casos de uso](../capitulo2/priorizacionCdU.md)) y por coherencia con la fase de Elaboración de RUP, este capítulo desarrolla con detalle los CdU que concentran riesgo técnico y valor de negocio, y trata los restantes de forma tabular cuando su tratamiento es derivable de la plantilla CRUD aplicada a las entidades del dominio.

<div align=center>

|Tratamiento|CdU|Justificación|
|-|-|-|
|**Detallado** (análisis y diseño completos)|CU-01, CU-09, CU-13, CU-14|Núcleo en tiempo real e integración con el webhook receptor — concentran el riesgo técnico|
|**Tabular** (clases y colaboraciones derivadas por simetría)|CU-02 a CU-08, CU-10 a CU-12|CdU CRUD sobre entidades del dominio que comparten estructura con los detallados|

</div>

### Decisiones técnicas

Las decisiones técnicas globales del sistema se introducen en [Diseño de la arquitectura](disenoArquitectura.md) y se justifican una a una contra los requisitos suplementarios:

<div align=center>

|Aspecto|Decisión|RS justificado|
|-|-|-|
|Estilo arquitectónico|Hexagonal (Ports & Adapters) con núcleo orientado a eventos|RS-04, RS-05, RS-08|
|Lenguaje y plataforma|TypeScript sobre Node.js (back) y React (front)|RS-03, RS-04|
|Persistencia primaria|PostgreSQL|RS-09|
|Almacenamiento caliente|Redis (ventana de operaciones del leaderboard)|RS-01, RS-02|
|Despliegue|Docker Compose, autoalojado en Infinite Fieldx|RS-03, RS-08|

</div>

### Trazabilidad

Cada artefacto producido en este capítulo apunta hacia atrás a los artefactos del Capítulo 2 que lo originan (CdU, requisitos suplementarios, modelo del dominio) y hacia adelante a los artefactos del Capítulo 4 (código, pruebas) que lo realizarán.

<div align=center>

|De|A|Mecanismo de trazabilidad|
|-|-|-|
|Modelo del dominio|Clases de análisis|Cada clase conceptual da origen a una o varias clases de análisis|
|CdU|Realizaciones de análisis|Cada CdU detallado tiene una colaboración de análisis nombrada `R(CU-XX)`|
|Requisitos suplementarios|Decisiones de arquitectura|Cada decisión cita los RS que la motivan|
|Clases de análisis|Clases de diseño|Cada clase de diseño nombra el rol de análisis del que procede|
|Clases de diseño|Paquetes de implementación|La organización en paquetes refleja la separación hexagonal|

</div>

### Inventario de diagramas

Todos los diagramas se distribuyen como `.puml` (fuente) y `.svg` (renderizado).

<div align=center>

|Disciplina|Diagrama|Documento|
|-|-|-|
|Análisis|`analisis-subsistemas`, `analisis-vistaLogica`|[Análisis de la arquitectura](analisisArquitectura.md)|
|Análisis|`analisis-R-CU-01`, `analisis-R-CU-09`, `analisis-R-CU-13`, `analisis-R-CU-14`, `analisis-R-CRUD`|[Análisis de los CdU](analisisCdU.md)|
|Análisis|`analisis-clases-leaderboard`, `analisis-clases-catalogo`, `analisis-clases-alertas`, `analisis-clases-evaluacion`, `analisis-clases-global`|[Análisis de clases](analisisClases.md)|
|Análisis|`analisis-paquetes`|[Análisis de paquetes](analisisPaquetes.md)|
|Diseño|`diseno-capas`, `diseno-eventos`, `diseno-modulos`|[Diseño de la arquitectura](disenoArquitectura.md)|
|Diseño|`diseno-secuencia-CU-01`, `diseno-secuencia-CU-09`, `diseno-secuencia-CU-13`, `diseno-secuencia-CU-14`, `diseno-secuencia-CRUD`|[Diseño de los CdU](disenoCdU.md)|
|Diseño|`diseno-clases-alertas`, `diseno-clases-leaderboard`, `diseno-clases-evaluacion`, `diseno-clases-catalogo`|[Diseño de clases](disenoClases.md)|
|Diseño|`diseno-paquetes`|[Diseño de paquetes](disenoPaquetes.md)|
|Diseño|`diseno-DER`|[Modelo de datos](modeloDeDatos.md)|
|Diseño|`diseno-despliegue`|[Diagrama de despliegue](despliegue.md)|

</div>
