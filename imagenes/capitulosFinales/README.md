# Material gráfico — capítulos finales

Esta carpeta agrupa el material gráfico referenciado desde los capítulos finales del TFG: **diagramas UML** (renderizados a partir de las fuentes de [`/modelosUML/capitulosFinales/`](../../modelosUML/capitulosFinales/)) y **capturas del SPA** generadas a partir de la solución en ejecución.

## Diagramas UML

<div align=center>

|Archivo|Diagrama|Documento que lo referencia|
|-|-|-|
|`navegacion.svg`|Mapa de navegación del SPA: estados del cap. 2 anotados con rutas del SPA y transiciones etiquetadas con CdU|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`cascadaCdU.svg`|Cascada compartida de capas Detalle → Prototipo → Análisis → Diseño → Implementación|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-01-secuencia.svg`|Secuencia de implementación de CU-01 (suscripción WS, ingestión, snapshot y empuje al cliente)|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md#cu-01--consultar-leaderboard)|
|`cu-09-secuencia.svg`|Secuencia de implementación de CU-09 (validación Zod, *reachability*, cifrado y persistencia)|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md#cu-09--crear-alerta-de-precio)|
|`cu-13-secuencia.svg`|Secuencia de implementación de CU-13 (allMids → bus → evaluación pura → disparo + <<include>> a CU-14)|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md#cu-13--evaluar-alertas-activas)|
|`cu-14-secuencia.svg`|Secuencia de implementación de CU-14 (transmisión, éxito/fallo, cola virtual de reintentos)|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md#cu-14--enviar-notificación)|
|`patronCRUD.svg`|Secuencia común del patrón CRUD que materializan CU-02..CU-08 y CU-10..CU-12|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md#casos-de-uso-crud--cu-02cu-08-y-cu-10cu-12)|
|`ajustesPila.svg`|Mapa de ajustes de pila *antes (cap. 3) → después (cap. 4)*, etiquetado por RS afectados|[`ajustesDePila.md`](../../docs/capitulosFinales/ajustesDePila.md)|
|`arbolObjetivos.svg`|Árbol Hipótesis → OG → OE1/OE2/OE3 → Capítulos del TFG|[`conclusiones.md`](../../docs/capitulosFinales/conclusiones.md)|
|`coberturaRS.svg`|Cobertura del MVP sobre RS-01..RS-10 agrupados por categoría, con anclaje a artefacto del repo|[`conclusiones.md`](../../docs/capitulosFinales/conclusiones.md#cobertura-de-los-requisitos-suplementarios)|
|`decisionesTecnicas.svg`|Seis decisiones técnicas estructurantes: alternativa descartada vs. solución elegida|[`discusion.md`](../../docs/capitulosFinales/discusion.md#decisiones-técnicas-de-mayor-calado)|
|`compromisosTransversales.svg`|Cuatro compromisos transversales del MVP como tensión entre dos métricas|[`discusion.md`](../../docs/capitulosFinales/discusion.md#compromisos-transversales)|
|`futurasLineas.svg`|Mindmap de las futuras líneas, organizadas en cuatro ejes (Infraestructura, Funcional, Calidad y seguridad, Validación y adopción)|[`futuras.md`](../../docs/capitulosFinales/futuras.md#mapa-de-continuaciones)|
|`plazosFuturas.svg`|Plazos orientativos por eje y dependencias entre ellos|[`futuras.md`](../../docs/capitulosFinales/futuras.md#plazos-y-dependencias)|

</div>

> Para regenerar los SVG desde la fuente, ejecutar `plantuml -tsvg modelosUML/capitulosFinales/*.puml -o imagenes/capitulosFinales/` desde la raíz del repositorio.

## Inventario de capturas del SPA

<div align=center>

|Archivo|Pantalla|Documento que la referencia|
|-|-|-|
|`leaderboard.png`|Vista principal del leaderboard (`/leaderboard`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`entidades.png`|Relación y detalle de entidades (`/entidades`, `/entidades/:id`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`direccion.png`|Detalle global de una dirección (`/direcciones/:addr`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`alertas.png`|Relación y formulario de alertas (`/alertas`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`cu-01-leaderboard.png`|CU-01 — Leaderboard en vivo|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-09-alerta-form.png`|CU-09 — Formulario de alerta|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-13-estado-alerta.png`|CU-13 — Transición de estado tras disparo|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-14-rearme.png`|CU-14 — Rearme tras entrega exitosa|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|

</div>

## Cómo generar las capturas

1. Arrancar el sistema con `docker compose -f src/docker-compose.yml up -d --build`.
2. Abrir `http://localhost:3001/` en un navegador con resolución mínima 1440×900.
3. Esperar a que la cobertura del leaderboard sea visible en al menos un par (`HYPE.p` recomendado).
4. Capturar cada pantalla con la composición indicada en la tabla anterior y guardar el PNG en esta carpeta con el nombre exacto.

> Las capturas son **opcionales** para la lectura del TFG: el documento es coherente sin ellas y los enlaces a artefactos del repositorio se mantienen completos. Las capturas refuerzan la exposición en la defensa oral, donde la presentación se hará desde el repositorio y el sistema en ejecución (ver [El repositorio](../../../TFGs-gII/capítulos/elRepo.md) en los materiales de referencia).
