# Ajustes de pila respecto al capítulo 3

Durante la disciplina de **Implementación** se han introducido un conjunto acotado de ajustes técnicos respecto a lo planteado en el [Diseño de la arquitectura](../capitulo3/disenoArquitectura.md). Cada ajuste **conserva** las decisiones arquitectónicas (puerto hexagonal hacia Hyperliquid, separación dominio/aplicación/presentación/infraestructura, comunicación intra-proceso por bus tipado, persistencia ACID en PostgreSQL) y **reduce dependencias** sin sacrificar requisitos suplementarios.

> Esta sección documenta el espacio entre el diseño técnico del capítulo 3 y la implementación efectiva. Es coherente con el principio metodológico de RUP: el diseño se refina durante la implementación cuando hay evidencia de que un ajuste es preferible —el repositorio es la fuente de verdad, y los ajustes a posteriori se documentan, no se ocultan.

## Resumen de ajustes

<div align=center>

| Aspecto | Diseño exploratorio inicial | Implementación final | Justificación | RS afectado |
|---|---|---|---|---|
| Framework HTTP/WS | NestJS 10 (con decoradores, módulos, providers) | **Fastify 5** con plugins `cors`, `websocket`, `static`, validación por Zod | Sobrecarga mínima sobre `http` nativo; latencia inferior y menos magia (clave para CU-01 y CU-13). El *scaffolding* de NestJS no aportaba valor para una API con 4 servicios | RS-01, RS-02 |
| ORM | TypeORM | **Drizzle ORM + Drizzle Kit** | SQL-first, migraciones explícitas como SQL plano, tipos derivados del esquema y peso muy inferior en tiempo de arranque | — |
| Estado caliente del leaderboard | Redis (sorted sets) | **Estructuras in-memory** (`LeaderboardState`) | Una sola máquina; `Map<Address, Aggregate>` + cola FIFO de operaciones provee `O(1)` por trade y elimina la dependencia operativa de Redis | RS-01, RS-03 |
| Cola de reintentos de notificación | Redis Lists + worker dedicado | Tabla `notificaciones` con `proximo_intento` indexado + **`RetryWorker`** periódico | Misma garantía operativa que la cola Redis (RS-07) con persistencia ACID integrada y sin servicio adicional | RS-03, RS-07 |
| Bus de eventos | `@nestjs/event-emitter` | **`EventEmitter` nativo de Node** envuelto en `TypedBus<DomainEventMap>` | Tipado estático sobre eventos del dominio; cero dependencias añadidas | RS-04 |
| Frontend | React + CRA (o Next.js) | **Vite 8 + React 19 + Tailwind 4 + shadcn/ui** | Build sub-segundo en desarrollo; tema dark profesional sin frameworks UI pesados; DX competitiva con CRA/Next sin su overhead | RS-05 |
| Cifrado del webhook | Servicio interno de cifrado aplicativo | `pgp_sym_encrypt` / `pgp_sym_decrypt` (**`pgcrypto`**) con `APP_SECRET` | La clave maestra vive solo en el proceso; el cifrado se delega a PostgreSQL, evitando manipular IVs en código aplicativo | RS-10 |
| Despliegue | Kubernetes (Helm chart) | **Docker Compose** con dos servicios (`app`, `postgres`) | El despliegue objetivo es una única máquina académica/de cliente; Compose proporciona reproducibilidad sin la complejidad operativa de Kubernetes | RS-03 |

</div>

## Trazabilidad de los ajustes a los requisitos suplementarios

Ningún ajuste degrada un requisito suplementario; varios los refuerzan al simplificar el sistema.

<div align=center>

|RS|Cambio respecto al diseño inicial|Cómo lo cubre el ajuste|
|-|-|-|
|**RS-01** ≤ 1 s en leaderboard|De Redis a in-memory|`LeaderboardService → LeaderboardState → WS` ya no atraviesa red interna; el coste por trade es `O(1)` en proceso|
|**RS-02** ≤ 2 s en evaluación|De NestJS a Fastify|`PrecioActualizado → bus → SELECT indexado → UPDATE` recorre menos capas; la indirección por decoradores desaparece|
|**RS-03** 24/7|De Kubernetes a Compose; de Redis a in-memory + Postgres|Una máquina, dos contenedores, healthchecks, `restart: unless-stopped`; menos puntos de fallo|
|**RS-04** Extensibilidad|De `@nestjs/event-emitter` a `TypedBus`|Nuevos consumidores se suscriben al bus con tipado estático del payload; nuevos tipos de alerta requieren solo una nueva función en `evaluator.ts`|
|**RS-05** Áreas independientes|De CRA/Next a Vite + shadcn/ui|Tres rutas raíz independientes (`/leaderboard`, `/entidades`, `/alertas`); componentes accesibles sin frameworks UI pesados|
|**RS-07** Reintentos|De Redis Lists a cola virtual en `notificaciones`|`RetryWorker` selecciona por `(estado, proximo_intento)` con índice ad-hoc; backoff configurable por variable de entorno|
|**RS-10** Seguridad del webhook|De cifrado aplicativo a `pgcrypto`|La clave maestra entra una sola vez por entorno; las funciones de cifrado se ejecutan en el servidor de BD, no en el proceso del API|

</div>

## Extensión funcional del CU-07

Durante la implementación se observó que el CU-07 (*Abrir direcciones de una entidad*) era demasiado limitado para el flujo operativo real: una vez identificada una dirección de interés en el leaderboard, el operador necesitaba moverse a un explorador externo para inspeccionar saldos, exposición y delegaciones. Para evitar esa salida, el CdU se ha extendido con una vista de **detalle global de dirección**, accesible tanto desde la página de la entidad como desde cualquier celda del leaderboard:

<div align=center>

|Sección|Endpoint|Fuente|
|-|-|-|
|Saldos perpetuos|`GET /api/direcciones/:addr/perps`|`IHyperliquidSource.getPerpState` *(REST `clearinghouseState`)*|
|Saldos spot|`GET /api/direcciones/:addr/spot`|`IHyperliquidSource.getSpotState` *(REST `spotClearinghouseState`)*|
|Resumen y delegaciones de staking|`GET /api/direcciones/:addr/staking`|`IHyperliquidSource.getDelegations` *(REST `delegatorSummary` + `delegations`)*|
|Últimas operaciones|`GET /api/direcciones/:addr/fills`|`IHyperliquidSource.getUserFills` *(REST `userFills`)*|
|Hipervínculo externo|—|[Hypurrscan](https://hypurrscan.io) — diagnóstico complementario fuera del alcance del sistema|

</div>

Esta extensión **no introduce un CdU nuevo**: se documenta como flujo alternativo *Ver detalle global* dentro del propio CU-07. El [diagrama de actividad de CU-07](../../imagenes/capitulo2/CU-07.svg) ya recoge esta variante y el [Diseño de CdU](../capitulo3/disenoCdU.md#variación-del-cu-07--detalle-global-de-una-dirección) la realiza con el `AddressDetailService`.

Tres consecuencias relevantes:

<div align=center>

|Consecuencia|Detalle|
|-|-|
|Modelo del dominio intacto|No aparecen nuevas entidades; la consulta es de **lectura** sobre la información ya expuesta por la L1 de Hyperliquid|
|Sustituibilidad RS-08 preservada|Las cuatro consultas se canalizan por el puerto `IHyperliquidSource`; cuando llegue `NanorethRpcAdapter`, el `AddressDetailService` lo aprovecha sin modificación|
|Trazabilidad cap. 2 → cap. 4|`DireccionDetailPage` aparece en el [mapa de navegación](mapaNavegacion.md) como destino doble (desde leaderboard y desde entidad), reflejando la naturaleza transversal de la vista|

</div>

## Trazabilidad RUP de la disciplina de Implementación

<div align=center>

|Disciplina|Capítulo|Evidencia en el repositorio|
|-|-|-|
|**Implementación**|Capítulo 4|Código fuente completo en [`src/`](../../src/); este documento + [Mapa de navegación](mapaNavegacion.md) + [Casos de uso implementados](casosDeUsoImplementados.md) recorren la implementación contra el diseño|
|**Pruebas**|Capítulo 4 (anexos)|Smoke tests: `tsc --noEmit` para backend y frontend, `vite build` para SPA, conexión real al WS público `wss://api.hyperliquid.xyz/ws` durante el arranque. Trazas documentadas en los [anexos](anexos.md)|
|**Despliegue**|Capítulo 4 (anexos)|`docker-compose.yml` (raíz de `src/`) + `app/Dockerfile` multi-stage construye SPA y backend en una sola imagen. Detalle en [diseño de despliegue](../capitulo3/despliegue.md) y guía de operación en los [anexos](anexos.md)|

</div>
