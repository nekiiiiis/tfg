# Recomendaciones y futuras líneas de actuación

El sistema entregado es —por construcción— una primera iteración. El capítulo 1 lo definió así (*MVP que responda a los requisitos capturados y al análisis y diseño realizados*) y la fase de Construcción se cerró en consecuencia. Esta sección plantea, de forma alineada con la [discusión de resultados](discusion.md) y con la propuesta de [escalabilidad futura](../capitulo1/estadoDelArte.md#escalabilidad-futura) ya esbozada en el estado del arte del capítulo 1, las continuaciones viables del proyecto.

Las futuras líneas se organizan en cuatro ejes:

<div align=center>

|Eje|Naturaleza|Cubre|
|-|-|-|
|**Infraestructura**|Operativa|Cómo se ejecuta el sistema cuando crece la carga o se quiere reducir la dependencia de servicios externos|
|**Funcional**|Producto|Qué nuevas capacidades aporta el sistema a Infinite Fieldx sin reescribir la arquitectura existente|
|**Calidad y seguridad**|Madurez|Qué endurecimientos hacen pasar al sistema de MVP a producto operativo en producción|
|**Validación y adopción**|Proceso|Cómo se cierra el ciclo con el cliente|

</div>

Cada línea declara explícitamente el **punto de extensión** del sistema actual y el **artefacto** que la habilita —no son ideas a abordar desde cero, son continuaciones del diseño ya en repositorio—.

---

## Infraestructura

### Del WS público al nodo no validador

**Punto de extensión:** Puerto `IHyperliquidSource` + factory `createHyperliquidSource()`.

El esqueleto `NanorethRpcAdapter` ya existe (`app/src/sources/nanoreth-rpc.adapter.ts`) y respeta la interfaz del puerto. El esfuerzo es la implementación funcional, no la integración: el resto del sistema **no sabrá** que la fuente ha cambiado.

<div align=center>

|Tarea|Detalle|
|-|-|
|Desplegar un nodo nanoreth|Instalación + sincronización inicial con la L1 de Hyperliquid|
|Implementar `subscribeTrades`, `subscribeAllMids` y los `getX` de cuenta sobre JSON-RPC|Mapeo de respuestas del nodo a los tipos `Operacion` / `Precio` del dominio|
|Conmutar `HYPERLIQUID_SOURCE=nanoreth` en `.env`|Sin tocar código del núcleo|
|Plan de contingencia|Si el nodo cae, el adaptador puede degradar a `PublicWsAdapter` automáticamente — refinamiento opcional del puerto|

</div>

**Beneficios esperados** (alineados con la discusión del [estado del arte](../capitulo1/estadoDelArte.md#escalabilidad-futura)):

- Eliminación de las restricciones de *rate limit* de la API pública.
- Acceso al flujo completo de la L1 sin pasar por la API gateway de Hyperliquid.
- Reducción de latencia para escenarios con monitorización masiva de direcciones.

### Crecer de un proceso a un cluster

**Punto de extensión:** Bus de eventos (`bus.ts`) + estado in-memory (`LeaderboardState`) + cola virtual (`notificaciones`).

La arquitectura actual asume un único proceso. Para escalar horizontalmente:

<div align=center>

|Componente actual|Sustitución para cluster|
|-|-|
|`TypedBus<DomainEventMap>` (in-process)|Bus distribuido (Redis Streams, NATS o Postgres `LISTEN/NOTIFY`)|
|`LeaderboardState` (RAM)|Sticky sessions por terna o estado compartido (Redis Cluster, hashmap distribuido)|
|`RetryWorker` (singleton por proceso)|Coordinación por lock (Postgres `advisory lock` o Redis `RedLock`) o partición por `hash(notificacionId)`|

</div>

Las decisiones del capítulo 3 lo prevén: el [diseño de la arquitectura](../capitulo3/disenoArquitectura.md#asignación-de-subsistemas-a-módulos) deja explícito que cada subsistema es independiente; ninguno mantiene un estado que el cluster no pueda particionar o compartir.

### Observabilidad operativa

**Punto de extensión:** `shared/logger.ts` (pino) + `shared/health.ts`.

<div align=center>

|Capacidad|Tarea|
|-|-|
|Métricas|Exportador Prometheus (`prom-client`) con contadores de trades por canal, alertas evaluadas, notificaciones por estado, latencia del bus, latencia HTTP/WS|
|Trazas|OpenTelemetry adaptado a Fastify y a las funciones de servicio, exportando a un colector (Jaeger / Tempo)|
|Dashboards|Grafana con paneles preparados sobre las métricas anteriores: salud del WS de Hyperliquid, *backlog* del retry worker, distribución de tiempo de evaluación|
|Alertas operativas|Reglas Prometheus sobre las métricas anteriores (e.g. *backlog > N* durante > 5 min)|

</div>

### Migración a Kubernetes (opcional)

**Punto de extensión:** `docker-compose.yml` y `app/Dockerfile`.

El Compose actual es deliberadamente simple. Si el sistema pasara a producción con réplicas y *rolling updates*, los Dockerfiles ya tienen la base: la imagen `runtime` es no-root, ligera (Node 20 Alpine) y declara healthcheck. La transición requiere:

<div align=center>

|Artefacto a añadir|Propósito|
|-|-|
|Helm chart o manifiestos K8s|Deployment, Service, ConfigMap, Secret, HPA|
|Migración del `LeaderboardState` a estado compartido|Pre-requisito para replicar la app *(ver "Crecer de un proceso a un cluster")*|
|Job de migraciones|`npm run db:migrate` como Job que precede al rolling deploy|

</div>

---

## Funcional

### Nuevos tipos de alerta

**Punto de extensión:** `modules/evaluacion/evaluator.ts` (función pura) + dominio (`Umbral` y similares).

El bus y la suscripción están ya preparados para nuevos eventos. Para añadir un nuevo tipo de alerta basta con:

1. Definir un nuevo tipo en el dominio (`AlertaActividad`, `AlertaInteresAbierto`, …) con su predicado puro.
2. Añadir el evento productor en el bus (e.g. `OperacionDeDireccion` para alertas por movimiento de wallet).
3. Suscribir un nuevo handler en `wireEvaluacion` que invoque el predicado.

Casos identificados durante el desarrollo:

<div align=center>

|Tipo de alerta|Necesidad de negocio|Evento productor en el bus|
|-|-|-|
|Por movimiento de una dirección|Avisar cuando una dirección monitorizada compra/vende un token específico|`OperacionRecibida` ya existe — basta filtrar por dirección + token|
|Por cambio en el interés abierto|Detectar señales tempranas de movimientos masivos en perpetuos|Nuevo evento `InteresAbiertoActualizado` alimentado desde un endpoint REST de Hyperliquid|
|Por *funding rate* extremo|Identificar oportunidades de carry o estrés del mercado|Nuevo evento `FundingRateActualizado` con polling periódico|
|Por cercanía a liquidación|Vigilar la salud de posiciones en lending o perpetuos|Requiere extensión a HyperEVM *(ver siguiente sección)*|

</div>

### Integración con HyperEVM

**Punto de extensión:** Nuevos adaptadores en `sources/` que implementen un puerto `IHyperEvmSource` (a definir).

El [estado del arte](../capitulo1/estadoDelArte.md#escalabilidad-futura) ya prevé esta dirección: monitorización de posiciones en protocolos de *lending* desplegados sobre HyperEVM, vigilando *health rates* bajos que indiquen proximidad a liquidación. La estrategia es la misma que con HyperCore: definir un puerto, implementar un adaptador por protocolo o por tipo de consulta, integrar nuevos eventos en el bus.

<div align=center>

|Componente|Esfuerzo|
|-|-|
|Cliente HyperEVM|Ya existe en el ecosistema (compatible EVM); puede usarse `viem` o `ethers`|
|Suscripción a logs de eventos de contratos|`eth_subscribe` sobre el WS de HyperEVM|
|Decodificación de eventos|ABIs de los protocolos a monitorizar|
|Nuevos tipos de dominio (`PosicionLending`, `HealthRate`)|En `domain/` siguiendo el patrón actual|

</div>

### Clusters reales de direcciones

El término *clustering* del capítulo 1 quedó implementado en el MVP como agrupación de direcciones bajo una misma entidad-nombre. Una extensión natural sería el clustering **automático** mediante heurísticas:

<div align=center>

|Heurística|Indicio|
|-|-|
|Direcciones que financian a otras desde la misma origin|Patrón típico de cuentas hot/cold de un mismo actor|
|Direcciones que operan en los mismos pares con timing correlacionado|Indicio de bot o de operador único con varias wallets|
|Direcciones con balances correlacionados a lo largo del tiempo|Patrón de gestión coordinada|

</div>

Esta capacidad encaja como un servicio nuevo (`modules/cluster/`) sin alterar el resto del sistema.

### Histórico y *replay* del leaderboard

`lb_trades` retiene operaciones por un periodo configurable (`LB_TRADES_RETENTION_DAYS`). Sobre esa base se puede construir:

<div align=center>

|Funcionalidad|Detalle|
|-|-|
|Leaderboard histórico|Reconstrucción de la clasificación para una ventana arbitraria del pasado a partir de `lb_trades`|
|Comparativa entre periodos|Difer comportamiento de las mismas direcciones entre dos ventanas distintas|
|Identificación de nuevos actores|Direcciones que aparecen en el top sin haber estado antes|

</div>

### Refinamiento del leaderboard

Sin cambios estructurales, hay refinamientos visuales y funcionales identificados como deuda agradable:

<div align=center>

|Refinamiento|Detalle|
|-|-|
|Histograma de actividad por dirección|Sparkline en cada fila del leaderboard mostrando el patrón de la última hora|
|Exportación a CSV/JSON|Snapshot del ranking actual para análisis offline|
|Configuración por usuario|Persistir la selección de mercado/token/temporalidad por sesión|

</div>

---

## Calidad y seguridad

### Endurecimiento de seguridad

El MVP asume despliegue en una red de confianza (intranet de Infinite Fieldx o tras un proxy con autenticación). Para producción abierta:

<div align=center>

|Capacidad|Tarea|
|-|-|
|Autenticación|OAuth2 / OIDC delegado a un IdP corporativo; sesión por cookie HttpOnly|
|Autorización|Roles (operador, lector, administrador) modelados como permisos sobre los CdU|
|Rate limiting de la API|Plugin `@fastify/rate-limit` con buckets por usuario o IP|
|Auditoría de operaciones sensibles|Bitácora de cambios sobre `entidades`, `direcciones`, `alertas`|
|Rotación de `APP_SECRET`|Re-cifrado en lote de `webhook_url_enc` con la nueva clave; mecanismo de rotación segura ya soportado por `pgcrypto`|

</div>

### Pruebas automatizadas

El smoke test actual cubre el camino feliz (`tsc --noEmit`, `vite build`, arranque con conexión real al WS). La continuación natural:

<div align=center>

|Capa|Estrategia|
|-|-|
|Dominio (`domain/`)|Pruebas unitarias puras sobre `evaluarUmbral`, `evaluarAlertasContraPrecio`, validadores de dirección y token|
|Servicios|Pruebas con dobles del puerto `IHyperliquidSource` y base de datos en memoria o contenedor efímero (`testcontainers`)|
|Rutas|Pruebas de integración con `fastify.inject(...)` (sin red real) cubriendo casos de éxito y fallo|
|End-to-end|Playwright o Cypress sobre flujos críticos del SPA (alta de entidad → leaderboard, alta de alerta → recepción de webhook simulado)|

</div>

### Internacionalización

La interfaz está actualmente en español. Si Infinite Fieldx desplegara el sistema para equipos no hispanohablantes, sería razonable internacionalizar con `react-i18next` o `formatjs`. Los textos del dominio (estados de alerta, mercados) ya están aislados en constantes (`domain.ts`), lo que facilita la transición.

---

## Validación y adopción

### Validación con el cliente (cierre del ciclo RUP)

El MVP está listo para entrar en la **fase de Transición** del proceso unificado: instalación en el entorno de Infinite Fieldx, ejecución sobre datos reales y retroalimentación operativa. Las actividades previstas:

<div align=center>

|Actividad|Detalle|
|-|-|
|Sesión de presentación de la solución|Recorrido sobre el repositorio + ejecución en vivo siguiendo el [mapa de navegación](mapaNavegacion.md)|
|Periodo de uso piloto|Configuración de las primeras entidades reales por el cliente; alertas sobre tokens de interés; observación de la cobertura de ventana en el leaderboard|
|Retroalimentación estructurada|Listado de **incidencias** (bugs) y **mejoras** (refinamientos) priorizadas; entrada del backlog de la segunda iteración|
|Ajustes de configuración|`LEADERBOARD_PREWARM`, `NOTIFICATION_RETRY_*`, `LB_TRADES_RETENTION_DAYS` afinados con métricas reales|

</div>

> Esta validación es la **prueba operativa** que valida la hipótesis del capítulo 1 más allá del MVP entregado. Cerrar el ciclo con el cliente convierte el TFG en producto.

### Documentación dirigida a operadores

El [README del repositorio](../../README.md) y el README de `src/` cubren el arranque para desarrolladores. Para operadores se sugiere añadir:

<div align=center>

|Documento|Contenido|
|-|-|
|Manual de despliegue|Pasos detallados de instalación en VM/host del cliente, copia de seguridad y restauración de la BD|
|Manual de operación|Casos de incidencia frecuentes y respuesta (WS de Hyperliquid caído, BD lenta, webhook receptor caído masivamente)|
|Runbook|Procedimientos para rotación de `APP_SECRET`, ampliación de `LEADERBOARD_PREWARM`, *vacuum* programado de `lb_trades`|

</div>

---

## Recapitulación

Las líneas anteriores comparten una propiedad: **ninguna requiere reescribir el sistema**. Todas son extensiones sobre puntos del diseño ya pensados para ello (puerto hexagonal, bus tipado, organización por feature, evaluador como función pura). El [capítulo 3](../capitulo3/README.md) anticipó esta extensibilidad como RS-04 y las decisiones arquitectónicas la materializaron; este capítulo lo confirma poniendo nombre a cada extensión.

<div align=center>

|Eje|Líneas|Plazo orientativo|
|-|-|-|
|Infraestructura|Nodo no validador, cluster, observabilidad, Kubernetes|Medio (3-6 meses)|
|Funcional|Nuevos tipos de alerta, HyperEVM, clustering automático, histórico|Medio-largo (6-12 meses)|
|Calidad y seguridad|AuthN/Z, rate limiting, suite de pruebas, i18n|Corto-medio (1-4 meses)|
|Validación y adopción|Sesión de presentación, piloto, retroalimentación, documentación operativa|Corto (semanas)|

</div>

La continuidad del proyecto es viable. El proceso metodológico que la habilita —RUP aplicado en serio durante el TFG— es, en última instancia, lo que distingue una entrega académica de un producto que el cliente puede llevarse y seguir construyendo sobre él.
