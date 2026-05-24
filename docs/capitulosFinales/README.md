# Capítulos finales — Descripción de la solución, conclusiones y futuras líneas

## ¿Qué?

Capítulos finales del TFG: presentan **la solución implementada** sobre el análisis y el diseño del capítulo 3, cierran el ciclo de objetivos abierto en el capítulo 1 y dejan delimitada la continuidad del proyecto más allá del MVP.

## ¿Por qué?

Resueltas las fases de captura de requisitos, análisis y diseño, toca dar fe del paso final del proceso: una primera iteración funcional sobre la que validar lo planteado con el cliente y discutir críticamente las decisiones tomadas durante el desarrollo.

## ¿Para qué?

- Demostrar que la solución implementada se corresponde con el análisis y el diseño documentados, recorriéndola en el orden lógico del **diagrama de contexto** (capítulo 2) y mostrando los **casos de uso más representativos** ya con elementos de interfaz reales.
- Cerrar la trazabilidad **objetivos ↔ disciplinas ↔ capítulos** establecida en el capítulo 1 con evidencia concreta del cumplimiento de cada objetivo específico.
- Reflexionar sobre las decisiones y compromisos asumidos durante el desarrollo y dejar definidas, fundamentadas en el propio proceso, las líneas futuras de continuación.

## ¿Cómo?

Siguiendo la división recomendada por la metodología: un capítulo de **presentación de la solución** (capítulo 4) y un capítulo de **opinión fundamentada** (capítulo 5), cerrado por los anexos con el material de soporte.

### Capítulo 4 — Descripción de la solución

<div align=center>

||||
|-|-|-|
|✅|[Mapa de navegación](mapaNavegacion.md)|Recorrido lógico de la interfaz, derivado del diagrama de contexto del capítulo 2 y materializado por las páginas reales del SPA|
|✅|[Casos de uso implementados](casosDeUsoImplementados.md)|Cascada completa (detalle de CdU → prototipo → análisis → diseño → interfaz) sobre los casos de uso más representativos|
|✅|[Ajustes de pila respecto al capítulo 3](ajustesDePila.md)|Cambios técnicos introducidos durante la implementación, conservando las decisiones arquitectónicas del capítulo 3|

</div>

> Código fuente de la solución: [`src/`](../../src/) · Capturas e imágenes del SPA: [`imagenes/capitulosFinales/`](../../imagenes/capitulosFinales/)

### Capítulo 5 — Conclusiones, discusión y futuras líneas

<div align=center>

||||
|-|-|-|
|✅|[Conclusiones](conclusiones.md)|Evidencia del cumplimiento de cada objetivo específico del capítulo 1|
|✅|[Discusión de resultados](discusion.md)|Reflexión sobre las decisiones de diseño y los compromisos asumidos durante el desarrollo|
|✅|[Recomendaciones y futuras líneas](futuras.md)|Continuaciones viables, fundamentadas en el proceso metodológico ya recorrido|
|✅|[Anexos](anexos.md)|Material de soporte: catálogos completos, configuración, smoke tests, trazas de proceso|

</div>

---

### Relación con el resto del TFG

<div align=center>

|Disciplina RUP|Fase RUP|Aporta a estos capítulos|
|-|-|-|
|**Implementación**|Construcción|Materializa los servicios, adaptadores y vistas diseñados en el capítulo 3 sobre la pila ajustada documentada en [ajustesDePila](ajustesDePila.md)|
|**Pruebas**|Construcción|Smoke tests, comprobaciones de tipos (`tsc --noEmit`), build del SPA (`vite build`) y conexión real con la L1 de Hyperliquid documentados en los [anexos](anexos.md)|
|**Despliegue**|Transición *(parcial)*|`docker-compose.yml` + `Dockerfile` multi-stage; consideraciones de operación documentadas en el diseño de despliegue del capítulo 3 y en los [anexos](anexos.md)|

</div>

> El alcance de la fase de Transición se limita a la construcción del MVP. Las líneas de continuación operativa, de extensión funcional y de evolución del producto se documentan en [Recomendaciones y futuras líneas](futuras.md), de acuerdo con la propuesta del capítulo 1.
