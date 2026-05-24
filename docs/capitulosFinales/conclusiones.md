# Conclusiones

El capítulo 1 estableció una hipótesis de partida, un objetivo general y tres objetivos específicos mapeados a las disciplinas y capítulos del TFG. Cerrar el trabajo exige aportar **evidencia concreta** de que cada uno se ha cumplido. Esta sección recorre los objetivos en el mismo orden en que se formularon y, para cada uno, señala el artefacto del repositorio que da fe del cumplimiento.

## Recordatorio: la hipótesis y los objetivos

<div align=center>

|Elemento|Formulación del capítulo 1|
|-|-|
|**Hipótesis**|El desarrollo de una solución a medida que integre el seguimiento de precios en tiempo real, un leaderboard de actividad con etiquetado y clustering de direcciones, y un sistema de alertas de precio con webhook, construida sobre la L1 de Hyperliquid, mejorará la capacidad operativa de Infinite Fieldx, cubriendo un vacío que ninguna herramienta existente en el ecosistema satisface.|
|**Objetivo general**|Desarrollar una solución que proporcione a Infinite Fieldx un conjunto de herramientas en tiempo real sobre la L1 de Hyperliquid: seguimiento de precios, clasificación de actividad por dirección con etiquetado y clustering, y alertas de precio con notificación vía webhook.|
|**OE1**|Ejecutar la disciplina de **requisitos** del sistema, capturando el modelo del dominio, identificando actores y casos de uso, y estableciendo los requisitos funcionales y no funcionales.|
|**OE2**|Ejecutar la disciplina de **análisis y diseño**, definiendo la arquitectura del sistema, las clases de análisis y diseño, y los modelos necesarios para guiar la implementación.|
|**OE3**|Desarrollar una primera iteración del sistema en forma de **producto mínimo viable** (MVP) que responda a los requisitos capturados y al análisis y diseño realizados.|

</div>

---

## OE1 — Disciplina de requisitos

> *Ejecutar la disciplina de requisitos del sistema, capturando el modelo del dominio, identificando actores y casos de uso, y estableciendo los requisitos funcionales y no funcionales.*

**Cumplido.** La disciplina se cerró en el [capítulo 2](../capitulo2/README.md) con la siguiente evidencia:

<div align=center>

|Elemento|Artefacto|
|-|-|
|Modelo del dominio (clases, objetos, estados)|[Modelo del dominio](../capitulo2/modeloDelDominio.md) · diagramas en [`/imagenes/capitulo2`](../../imagenes/capitulo2/)|
|Glosario|[Glosario](../capitulo2/glosario.md)|
|Actores identificados (Usuario, Hyperliquid L1, Servicio Webhook)|[Actores y casos de uso](../capitulo2/actoresYCasosDeUso.md)|
|Catálogo de 14 casos de uso aplicando el patrón **atómico CRUD**|[Actores y casos de uso](../capitulo2/actoresYCasosDeUso.md) · [Priorización](../capitulo2/priorizacionCdU.md) · [Detalle](../capitulo2/detalleCdU.md)|
|Prototipos de interfaz por CdU (P1..P6)|[Prototipos de CdU](../capitulo2/prototiposCdU.md) · imágenes en `/imagenes/capitulo2`|
|Diagrama de contexto del sistema (estados y transiciones)|[Diagrama de contexto](../capitulo2/diagramaDeContexto.md)|
|Requisitos suplementarios (RS-01..RS-10)|[Requisitos suplementarios](../capitulo2/requisitosSupplementarios.md)|

</div>

La trazabilidad de la disciplina queda probada por el [diagrama de contexto](../capitulo2/diagramaDeContexto.md): **todos** los CdU del catálogo aparecen como transiciones entre estados; **ninguna** transición carece de CdU; **ningún** estado se queda sin entrada ni salida. La completitud no se afirma, se verifica visualmente sobre el diagrama.

> **OE1 ⇒ Capítulo 2 ⇒ Disciplina de requisitos cerrada.**

---

## OE2 — Disciplina de análisis y diseño

> *Ejecutar la disciplina de análisis y diseño, definiendo la arquitectura del sistema, las clases de análisis y diseño, y los modelos necesarios para guiar la implementación.*

**Cumplido.** La disciplina se desarrolló en el [capítulo 3](../capitulo3/README.md), aplicando en orden las cuatro actividades de Análisis y las seis de Diseño, cada una partiendo del artefacto inmediatamente anterior.

<div align=center>

|Actividad RUP|Artefacto del capítulo 3|
|-|-|
|Analizar la arquitectura|[`analisisArquitectura.md`](../capitulo3/analisisArquitectura.md): subsistemas (S-PRES, S-INGE, S-LEAD, S-CATA, S-ALER, S-EVAL, S-NOTI) + dependencias|
|Analizar los CdU|[`analisisCdU.md`](../capitulo3/analisisCdU.md): realizaciones `R(CU-XX)` con `<<boundary>>`, `<<control>>` y `<<entity>>`|
|Analizar las clases|[`analisisClases.md`](../capitulo3/analisisClases.md): catálogo por área funcional|
|Analizar los paquetes|[`analisisPaquetes.md`](../capitulo3/analisisPaquetes.md): agrupación cohesiva y dependencias|
|Diseñar la arquitectura|[`disenoArquitectura.md`](../capitulo3/disenoArquitectura.md): arquitectura en capas + **puerto hexagonal** hacia Hyperliquid; trazabilidad RS-01..RS-10|
|Diseñar los CdU|[`disenoCdU.md`](../capitulo3/disenoCdU.md): realizaciones de diseño con clases concretas (CU-01, CU-09, CU-13, CU-14 al detalle; resto por patrón CRUD)|
|Diseñar las clases|[`disenoClases.md`](../capitulo3/disenoClases.md): servicios, adaptadores, gateways y tipos del dominio|
|Diseñar los paquetes|[`disenoPaquetes.md`](../capitulo3/disenoPaquetes.md): estructura física de directorios|
|Modelar los datos|[`modeloDeDatos.md`](../capitulo3/modeloDeDatos.md): esquema lógico y físico|
|Diseñar el despliegue|[`despliegue.md`](../capitulo3/despliegue.md): topología, redes, volúmenes, healthchecks|

</div>

**Dos decisiones arquitectónicas** soportan el resto del sistema, ambas justificadas frente a los requisitos suplementarios:

<div align=center>

|Decisión|Cubre|
|-|-|
|**Arquitectura en capas + puerto hexagonal** hacia Hyperliquid (`IHyperliquidSource`)|RS-04, RS-08 — la sustituibilidad de la fuente de datos no requiere tocar el núcleo del sistema|
|**Comunicación intra-proceso por bus de eventos tipado** (`TypedBus<DomainEventMap>`)|RS-04 — productores y consumidores se ignoran mutuamente; añadir un nuevo consumidor es una suscripción adicional|

</div>

La trazabilidad **requisito suplementario → decisión arquitectónica → artefacto del repositorio** está cerrada en una sola tabla del [diseño de la arquitectura](../capitulo3/disenoArquitectura.md#trazabilidad-de-los-requisitos-suplementarios).

> **OE2 ⇒ Capítulo 3 ⇒ Disciplinas de Análisis y Diseño cerradas.**

---

## OE3 — Producto Mínimo Viable

> *Desarrollar una primera iteración del sistema en forma de producto mínimo viable (MVP) que responda a los requisitos capturados y al análisis y diseño realizados.*

**Cumplido.** El MVP vive en [`src/`](../../src/) y se documenta en este capítulo 4.

### Cobertura funcional del catálogo de CdU

Los 14 casos de uso del capítulo 2 están implementados:

<div align=center>

|Bloque|CdU|Implementación|
|-|-|-|
|Leaderboard|CU-01|[Casos de uso implementados — CU-01](casosDeUsoImplementados.md#cu-01--consultar-leaderboard)|
|Entidades|CU-02..CU-05|[Patrón CRUD](casosDeUsoImplementados.md#casos-de-uso-crud--cu-02cu-08-y-cu-10cu-12)|
|Direcciones|CU-06..CU-08 *(con extensión global)*|[Patrón CRUD](casosDeUsoImplementados.md#casos-de-uso-crud--cu-02cu-08-y-cu-10cu-12) + [Ajustes de pila](ajustesDePila.md#extensión-funcional-del-cu-07)|
|Alertas|CU-09..CU-12|[CU-09](casosDeUsoImplementados.md#cu-09--crear-alerta-de-precio) + [Patrón CRUD](casosDeUsoImplementados.md#casos-de-uso-crud--cu-02cu-08-y-cu-10cu-12)|
|Evaluación automática|CU-13, CU-14|[CU-13](casosDeUsoImplementados.md#cu-13--evaluar-alertas-activas) + [CU-14](casosDeUsoImplementados.md#cu-14--enviar-notificación)|

</div>

### Cumplimiento de los requisitos suplementarios

Los 10 requisitos suplementarios del capítulo 2 quedan cubiertos por la solución:

<div align=center>

|RS|Cubierto por|Verificable en|
|-|-|-|
|**RS-01** Latencia leaderboard ≤ 1 s|Pipeline `WS → LeaderboardState → WS` in-process|`leaderboard.service.ts`, `leaderboard.ws.ts` *(sin capa intermedia de persistencia)*|
|**RS-02** Latencia evaluación ≤ 2 s|Suscripción a `PrecioActualizado` + índice `alertas_token_estado`|`evaluacion.subscriber.ts`, migración `0000_init.sql`|
|**RS-03** 24/7|Proceso Node único + Postgres + healthchecks + `restart: unless-stopped`|`docker-compose.yml`, `Dockerfile`|
|**RS-04** Extensibilidad|Bus de eventos tipado + `evaluator.ts` como función pura|`bus.ts`, `domain/events.ts`, `modules/evaluacion/evaluator.ts`|
|**RS-05** Áreas independientes|Tres rutas raíz independientes en el SPA|`web/src/App.tsx`|
|**RS-06** Mercados distinguidos|`Mercado` como tipo de primer orden en el dominio|`domain/types.ts`, `LeaderboardFilters.tsx`|
|**RS-07** Reintentos de notificación|`RetryWorker` + columna `proximo_intento`|`modules/notificacion/retry.worker.ts`|
|**RS-08** Sustituibilidad de la fuente|Puerto `IHyperliquidSource` + dos adaptadores|`sources/hyperliquid.port.ts`, `sources/public-ws.adapter.ts`, `sources/nanoreth-rpc.adapter.ts`|
|**RS-09** Trazabilidad de la entrega|Tabla `notificaciones` con `alerta_id`, `precio_disparador`, `instante_emision`|`persistence/schema/notificaciones.ts`|
|**RS-10** Seguridad del webhook|`pgp_sym_encrypt` + clave maestra `APP_SECRET`|`persistence/crypto.ts`, `persistence/schema/alertas.ts`|

</div>

### Evidencia operativa

El MVP es **ejecutable**: el repositorio incluye `docker-compose.yml` y `Dockerfile` multi-stage. Levantar la solución completa requiere dos comandos:

```bash
cp src/.env.example src/.env       # (requiere completar APP_SECRET y POSTGRES_PASSWORD)
docker compose -f src/docker-compose.yml up -d --build
```

Tras el arranque, el sistema se conecta al WS público de Hyperliquid (`wss://api.hyperliquid.xyz/ws`), precarga los canales configurados en `LEADERBOARD_PREWARM` y queda disponible en `http://localhost:3001/`. El smoke test correspondiente está documentado en los [anexos](anexos.md).

> **OE3 ⇒ Capítulos finales ⇒ Construcción cerrada; Transición acotada al MVP.**

---

## Hipótesis y objetivo general

Con los tres objetivos específicos cumplidos, la **hipótesis** queda contrastada en el ámbito del MVP: existe una solución a medida que integra las tres herramientas, construida sobre la L1 de Hyperliquid, que cubre un vacío que ninguna alternativa del [estado del arte](../capitulo1/estadoDelArte.md) satisface íntegramente. La validación operativa con Infinite Fieldx —prevista como continuación natural— queda recogida en [Recomendaciones y futuras líneas](futuras.md).

El **objetivo general** está cumplido: el repositorio entrega un sistema que proporciona

- **Seguimiento de precios en tiempo real** — `PriceTicker` + canal `allMids` (RS-01).
- **Clasificación de actividad por dirección con etiquetado y clustering** — `LeaderboardTable` + `CatalogoService.resolverDirecciones` (CU-01 + CU-02..CU-08; "clustering" entendido como agrupación de direcciones bajo una misma entidad-nombre).
- **Alertas de precio con notificación vía webhook** — `AlertaForm` + `wireEvaluacion` + `NotificacionService` + `RetryWorker` (CU-09..CU-14; RS-07, RS-09, RS-10).

---

## Síntesis: del escenario al producto

<div align=center>

|Hito|Capítulo|Estado|
|-|-|-|
|Escenario, estado del arte, hipótesis y objetivos|Cap. 1|✅ Cerrado|
|Modelo del dominio, casos de uso, requisitos|Cap. 2|✅ Cerrado|
|Arquitectura, análisis, diseño, modelo de datos, despliegue|Cap. 3|✅ Cerrado|
|Implementación y descripción de la solución|Caps. finales (Cap. 4)|✅ Cerrado|
|Conclusiones, discusión y futuras líneas|Caps. finales (Cap. 5)|✅ Cerrado|

</div>

El trabajo ha respetado en todo momento la cadena RUP **fases → disciplinas → entregables → criterios de transición** que definió el [capítulo 1 — Metodología](../capitulo1/metodologia.md). Cada entregable de un capítulo fue precondición del siguiente; ninguno se elaboró fuera del orden establecido. Que el resultado sea un **MVP ejecutable** —no un boceto, no un prototipo descartable— es la prueba de que el proceso, aplicado con disciplina, conduce al producto.
