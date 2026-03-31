# Herramientas en Tiempo Real sobre la L1 de Hyperliquid

<div align=center>

Trabajo de Fin de Grado — Grado en Ingeniería Informática

Universidad Europea del Atlántico — Curso 2025–2026

</div>

## Acerca de

<div align=center>

|Cliente real obligatorio|Metodología formal explícita|Trazabilidad total vía repositorio|
|-|-|-|
|**Infinite Fieldx**|**RUP** (Proceso Unificado)|Este repositorio|
|Empresa de market making y HFT trading que opera en Hyperliquid. Las decisiones de diseño responden a necesidades verificables.|Dirigido por casos de uso, centrado en la arquitectura, iterativo e incremental. Estructura el proceso y hace auditables las decisiones técnicas.|El historial de commits expone el proceso de creación como objeto evaluable.|

</div>

> Desarrollo de una solución que proporcione a Infinite Fieldx un conjunto de herramientas en tiempo real sobre la L1 de Hyperliquid: seguimiento de precios, clasificación de actividad por dirección con etiquetado y clustering, y alertas de precio con notificación vía webhook.

## Esquema & Entregables

<div align=center>

|Entrega|Capítulo|Contenido|Estado|
|-|-|-|:-:|
|1.ª|[Capítulo 1](docs/capitulo1/README.md)|Contextualización, estado del arte, objetivos y metodología|✅|
|2.ª|[Capítulo 2](docs/capitulo2/README.md)|Disciplina de requisitos|✅|
|3.ª|[Capítulo 3](docs/capitulo3/README.md)|Análisis y diseño|🔲|
|4.ª|[Capítulos finales](docs/capitulosFinales/README.md)|Descripción de la solución, conclusiones, discusión, recomendaciones y futuras líneas|🔲|

</div>

## Estructura del repositorio

<div align=center>

|||
|-|-|
|[docs/](docs/)|Documentación de cada capítulo del TFG|
|[modelosUML/](modelosUML/)|Fuentes PlantUML de los diagramas (capítulos 2 y 3)|
|[imagenes/](imagenes/)|Imágenes y diagramas renderizados|
|[src/](src/)|Código fuente de la solución (capítulos finales)|

</div>

---

## [Capítulo 1](docs/capitulo1/README.md) — Contextualización, estado del arte y metodología

<div align=center>

||Sección|
|-|-|
|✅|[Introducción, escenario y marco teórico](docs/capitulo1/introduccion.md)|
|✅|[Estado del arte](docs/capitulo1/estadoDelArte.md)|
|✅|[Objetivos](docs/capitulo1/objetivos.md)|
|✅|[Metodología](docs/capitulo1/metodologia.md)|
|✅|[Bibliografía](docs/capitulo1/bibliografia.md)|


</div>

---

## [Capítulo 2](docs/capitulo2/README.md) — Disciplina de requisitos

### Modelo del dominio

<div align=center>

||Artefacto|
|-|-|
|✅|[Modelo del dominio](docs/capitulo2/modeloDelDominio.md) · Diagramas de clases, objetos, estados|
|✅|[Glosario](docs/capitulo2/glosario.md)|
|✅|[Requisitos suplementarios](docs/capitulo2/requisitosSupplementarios.md)|

</div>

### Casos de uso

<div align=center>

||Actividad|
|-|-|
|✅|[Encontrar actores y casos de uso](docs/capitulo2/actoresYCasosDeUso.md)|
|✅|[Priorizar casos de uso](docs/capitulo2/priorizacionCdU.md)|
|✅|[Detallar casos de uso](docs/capitulo2/detalleCdU.md)|
|✅|[Prototipar casos de uso](docs/capitulo2/prototiposCdU.md)|
|✅|[Estructurar modelo de CdU](docs/capitulo2/estructuraCdU.md)|
|✅|[Diagrama de contexto](docs/capitulo2/diagramaDeContexto.md)|

</div>

> Fuentes PlantUML: [modelosUML/capitulo2](modelosUML/capitulo2) · Imágenes: [imagenes/capitulo2](imagenes/capitulo2)

---

## [Capítulo 3](docs/capitulo3/README.md) — Análisis y diseño

### Análisis

<div align=center>

||Actividad|
|-|-|
|🔲|[Análisis de la arquitectura](docs/capitulo3/analisisArquitectura.md)|
|🔲|[Análisis de casos de uso](docs/capitulo3/analisisCdU.md)|
|🔲|[Análisis de clases](docs/capitulo3/analisisClases.md)|
|🔲|[Análisis de paquetes](docs/capitulo3/analisisPaquetes.md)|

</div>

### Diseño

<div align=center>

||Actividad|
|-|-|
|🔲|[Diseño de la arquitectura](docs/capitulo3/disenoArquitectura.md)|
|🔲|[Diseño de casos de uso](docs/capitulo3/disenoCdU.md)|
|🔲|[Diseño de clases](docs/capitulo3/disenoClases.md)|
|🔲|[Diseño de paquetes](docs/capitulo3/disenoPaquetes.md)|
|🔲|[Diagramas de despliegue](docs/capitulo3/despliegue.md)|
|🔲|[Modelo de datos](docs/capitulo3/modeloDeDatos.md)|

</div>

> Fuentes PlantUML: [modelosUML/capitulo3](modelosUML/capitulo3) · Imágenes: [imagenes/capitulo3](imagenes/capitulo3)

---

## [Capítulos finales](docs/capitulosFinales/README.md) — Descripción de la solución, conclusiones y futuras líneas

### Capítulo 4 — Descripción de la solución

<div align=center>

||Sección|
|-|-|
|🔲|[Mapa de navegación](docs/capitulosFinales/mapaNavegacion.md)|
|🔲|[Casos de uso implementados](docs/capitulosFinales/casosDeUsoImplementados.md)|
|🔲|Código fuente: [src/](src/)|

</div>

### Capítulo 5 — Conclusiones y futuras líneas

<div align=center>

||Sección|
|-|-|
|🔲|[Conclusiones](docs/capitulosFinales/conclusiones.md)|
|🔲|[Discusión de resultados](docs/capitulosFinales/discusion.md)|
|🔲|[Recomendaciones y futuras líneas](docs/capitulosFinales/futuras.md)|
|🔲|[Anexos](docs/capitulosFinales/anexos.md)|

</div>

> Capturas de la interfaz: [imagenes/capitulosFinales](imagenes/capitulosFinales)

---

## Proceso de creación

<div align=center>

|Fase RUP|Disciplinas|Entrega|Estado|
|-|-|-|:-:|
|Inicio|Contextualización y viabilidad|Cap. 1|✅|
|Elaboración|Modelado del dominio, Requisitos|Cap. 2|✅|
|Elaboración|Análisis, Diseño|Cap. 3|🔲|
|Construcción|Implementación, Pruebas|Caps. finales|🔲|
|Transición|Futuras líneas|Caps. finales|🔲|

</div>

---

**Autor:** Neco Martínez Saiz

**Director:** José Manuel Breñosa Martínez
