# Diseño de clases

## Propósito

El diseño de clases refina el [Análisis de clases](analisisClases.md) hasta el nivel necesario para que la implementación del Capítulo 4 sea un refinamiento mecánico del diseño. Cada clase de análisis se materializa en una o varias clases de diseño con **responsabilidades, firmas tipadas, estereotipos y dependencias** explícitas, organizadas según la arquitectura hexagonal fijada en el [Diseño de la arquitectura](disenoArquitectura.md). El diseño no incluye cuerpos de método: el cuerpo es la implementación.

<div align=center>

|||
|-|-|
|**Punto de partida**|Clases de análisis (boundary/control/entity), arquitectura hexagonal y módulos NestJS del [Diseño de la arquitectura](disenoArquitectura.md)|
|**Resultado**|Catálogo de clases de diseño por módulo y por capa hexagonal, con interfaces de puerto, servicios de aplicación, repositorios, adaptadores, DTOs y mappers|
|**Restricción**|Cada clase de diseño nombra el rol de análisis del que procede; cada interfaz de puerto refleja una operación del control de análisis|

</div>

## Convenciones

<div align=center>

|Convención|Aplicación|
|-|-|
|**Nomenclatura**|Servicios de aplicación: `XxxService`. Puertos de entrada: `IXxxService` o `IXxxQueryService` (segregados por cliente, ISP). Repositorios: `IXxxRepository`. Adaptadores externos: `XxxConnector`. DTOs: `CrearXxxDto`, `XxxResponseDto`. Eventos: nombres en pasado (`AlertaDisparada`, `PrecioActualizado`)|
|**Estereotipos UML**|`<<service>>`, `<<repo>>`, `<<adapter>>`, `<<controller>>`, `<<gateway>>`, `<<dto>>`, `<<mapper>>`, `<<entity>>`, `<<value>>`, `<<port-in>>`, `<<port-out>>`|
|**Visibilidad**|Repositorios y adaptadores se mantienen privados al módulo. Solo los puertos de entrada se exportan|
|**Inmutabilidad**|DTOs y eventos son inmutables. Las entidades del dominio mutan únicamente a través de métodos que respetan invariantes|
|**Errores**|Excepciones del dominio extienden una clase abstracta `DomainException`. La traducción a códigos HTTP se aísla en un filtro de la capa de presentación|
|**Tipado del dominio**|Se usan *value objects* (`Address`, `TokenSymbol`, `Volume`, `Webhook`, `Umbral`) en lugar de tipos primitivos cuando el tipo aporta restricciones del dominio|

</div>

---

## Capa de dominio (`domain/`)

Independiente de cualquier framework. Aloja únicamente entidades del dominio, objetos valor, eventos del dominio y excepciones del dominio.

### Entidades del dominio

Cada entidad del [Modelo del dominio](../capitulo2/modeloDelDominio.md) se materializa con sus invariantes encapsuladas en el constructor y métodos que mantienen la consistencia. Las máquinas de estado identificadas en el Capítulo 2 (`AlertaPrecio`, `Notificacion`) se implementan con un método de transición que valida la matriz de transiciones permitidas.

<div align=center>

|Entidad|Atributos|Operaciones|Invariantes|
|-|-|-|-|
|`Entidad`|`id`, `nombre`, `direcciones`|`cambiarNombre`, `añadirDireccion`, `eliminarDireccion`|Nombre único, no vacío; al menos una dirección|
|`Direccion`|`id`, `valor`, `entidad`|—|Formato `0x[a-f0-9]{40}`; pertenece a una sola entidad|
|`AlertaPrecio`|`id`, `token`, `umbral`, `webhook`, `estado`|`evaluar`, `marcarDisparada`, `rearmar`, `marcarFallida`|Transiciones de estado restringidas (cf. *Diagrama de estados* del Cap. 2)|
|`Notificacion`|`id`, `alerta`, `precioDisparador`, `instanteEmision`, `estadoEntrega`|`marcarEntregada`, `marcarFallida`|Transiciones del estado de entrega|

</div>

### Objetos valor

<div align=center>

|Clase|Encapsula|Invariantes|
|-|-|-|
|`EntidadId`, `AlertaId`, `DireccionId`, `NotificacionId`|UUID|Formato UUID v4 válido|
|`NombreEntidad`|texto|Longitud 1..64, sin caracteres de control|
|`TokenSymbol`|texto|`[A-Z0-9-]{1,16}`|
|`Address`|texto|Hexadecimal `0x[a-f0-9]{40}`|
|`Volume`|entero grande|Positivo, ≤ 10²⁴|
|`Precio`|`{valor, instante, token}`|`valor > 0`, `instante` no futuro|
|`Umbral`|`{cruce, valor}`|`cruce ∈ {SUBE, BAJA}`, `valor > 0`|
|`Webhook`|URL|HTTPS obligatorio (RS-10), longitud ≤ 2048|

</div>

### Eventos del dominio

Todos los eventos heredan de una clase abstracta `DomainEvent` con `eventName` y `ocurridoEn`. Son inmutables.

<div align=center>

|Evento|Productor|Carga útil|
|-|-|-|
|`OperacionRecibida`|`HyperliquidConnector`|`Operacion`|
|`PrecioActualizado`|`HyperliquidConnector`|`Token`, `Precio`|
|`AlertaDisparada`|`PriceUpdateHandler`|`AlertaId`, `Precio`|
|`NotificacionConfirmada`|`NotificacionService`|`NotificacionId`|
|`NotificacionFallida`|`NotificacionService`|`NotificacionId`, motivo|

</div>

### Excepciones del dominio

`DomainException` (abstracta) es la raíz. Las subclases concretas son `EntidadDuplicadaException`, `DireccionYaAsignadaException`, `WebhookInaccesibleException`, `TransicionEstadoNoPermitida`, `AlertaNoEncontrada`, etc.

---

## Capa de aplicación (`application/`)

Define los **puertos** y aloja los **servicios de aplicación** que realizan los CdU. No conoce TypeORM, ioredis ni HTTP.

### Puertos de entrada

Cada control del análisis se traduce en una interfaz de puerto. Los controllers REST y los gateways WS dependen de la interfaz, nunca de la implementación.

<div align=center>

|Puerto de entrada|Operaciones expuestas|Cliente|
|-|-|-|
|`IAlertasService`|`crear`, `listar`, `editar`, `eliminar`|`AlertasController`|
|`IAlertasQueryService`|`recuperarOperativasPara`|`PriceUpdateHandler` *(ISP)*|
|`ICatalogoService`|`crearEntidad`, `listarEntidades`, `editarEntidad`, `eliminarEntidad`, `añadirDireccion`, `listarDirecciones`, `eliminarDireccion`|`EntidadesController`, `DireccionesController`|
|`ICatalogoQueryService`|`resolverNombre`, `existeToken`|`LeaderboardService`, `AlertasService` *(ISP)*|
|`ILeaderboardService`|`obtenerSnapshot`, `suscribir`|`LeaderboardGateway`|
|`INotificacionService`|`enviar`|`AlertTriggeredHandler`|

</div>

> La aplicación del Principio de Segregación de Interfaces se materializa en parejas `IXxxService` / `IXxxQueryService`: el cliente solo depende del subconjunto de operaciones que usa.

### Puertos de salida

Definen lo que la aplicación **necesita** del exterior. La implementación reside en `infrastructure/`.

<div align=center>

|Puerto de salida|Operaciones requeridas|Implementación|
|-|-|-|
|`IAlertasRepository`|`save`, `findById`, `findOperativasPorToken`, `delete`|`AlertasRepositoryTypeOrm`|
|`IEntidadesRepository`, `IDireccionesRepository`|CRUD sobre la entidad correspondiente|`*RepositoryTypeOrm`|
|`INotificacionesRepository`|`save`, `findPendientes`, `actualizarEstado`|`NotificacionesRepositoryTypeOrm`|
|`ILeaderboardSnapshotRepository`|`añadirOperacion`, `obtenerTopN`, `purgarVentana`|`LeaderboardSnapshotRepositoryRedis`|
|`IHyperliquidPort`|`suscribir`, `desuscribir`|`HyperliquidConnector`|
|`IWebhookConnector`|`checkReachability`, `transmitir`|`WebhookConnectorHttp`|
|`IRetryQueue`|`enqueue`, `consume`|`RetryQueueRedis`|
|`IEventBus`|`emit`, `on`|`EventBusAdapter`|

</div>

### Servicios de aplicación

Cada servicio implementa uno o varios puertos de entrada y orquesta la realización del CdU; inyecta los puertos de salida que necesita. El cuerpo de cada operación se concretará en el Capítulo 4 — el diseño fija únicamente la firma, las dependencias y la transaccionalidad.

<div align=center>

|Servicio|Implementa|Inyecta|Transaccionalidad|
|-|-|-|-|
|`AlertasService`|`IAlertasService`|`IAlertasRepository`, `ICatalogoQueryService`, `IWebhookConnector`, `IEventBus`|`@Transactional` en `crear`, `editar`, `eliminar`|
|`CatalogoService`|`ICatalogoService`, `ICatalogoQueryService`|`IEntidadesRepository`, `IDireccionesRepository`, `IEventBus`|`@Transactional` en operaciones multi-entidad (alta entidad + direcciones iniciales)|
|`LeaderboardService`|`ILeaderboardService`|`ILeaderboardSnapshotRepository`, `ICatalogoQueryService`, `IHyperliquidPort`|—|
|`NotificacionService`|`INotificacionService`|`INotificacionesRepository`, `IWebhookConnector`, `IRetryQueue`, `IAlertasService`, `IEventBus`|`@Transactional` en `enviar` (persiste la `Notificacion` antes de transmitir, RS-09)|
|`PriceUpdateHandler`|—|`IAlertasQueryService`, `AlertEvaluator`, `IEventBus`|`@OnEvent('PrecioActualizado')`|
|`AlertTriggeredHandler`|—|`INotificacionService`|`@OnEvent('AlertaDisparada')`|
|`OperationIngestionHandler`|—|`ILeaderboardSnapshotRepository`, `IEventBus`|`@OnEvent('OperacionRecibida')`|
|`AlertEvaluator`|—|*(ninguna — estrategia pura)*|—|
|`RetryWorker`|—|`IRetryQueue`, `INotificacionService`|*(consumidor bloqueante)*|

</div>

### DTOs y mappers

Cada borde del sistema cruza con un DTO inmutable. Los mappers traducen entre DTOs ↔ entidades del dominio. **No se exponen entidades del dominio sobre HTTP** — esa es una regla del diseño que el código del Capítulo 4 deberá respetar.

<div align=center>

|DTO|Sentido|Validación|Notas|
|-|-|-|-|
|`CrearAlertaDto`|Entrada|`token` formato `[A-Z0-9-]{1,16}`, `umbral > 0`, `cruce ∈ {SUBE,BAJA}`, `webhook` URL HTTPS|—|
|`EditarAlertaDto`|Entrada|Campos opcionales con las mismas reglas|—|
|`AlertaResponseDto`|Salida|—|**Nunca** incluye la URL del webhook (RS-10); sí incluye `webhookAlcanzable`|
|`CrearEntidadDto`, `EditarEntidadDto`, `EntidadResponseDto`|—|Nombre 1..64, sin caracteres de control|—|
|`CrearDireccionDto`, `DireccionResponseDto`|—|Formato hex `0x...`|—|
|`ConsultaLeaderboardDto`|Entrada (WS)|`mercado`, `token`, `temporalidad` válidos|—|
|`FilaLeaderboardDto`|Salida (WS)|—|Incluye `direccion`, `nombreResuelto?`, `volumenCompra`, `volumenVenta`|

</div>

Los mappers correspondientes (`AlertaPrecioMapper`, `EntidadMapper`, `NotificacionMapper`, …) son clases sin estado con métodos `fromDto`/`toResponse` o `fromOrm`/`toOrm`.

---

## Capa de infraestructura (`infrastructure/`)

Implementa los puertos de salida. El núcleo no conoce esta capa.

### Adaptadores de persistencia

<div align=center>

|Adaptador|Implementa|Tecnología|Notas|
|-|-|-|-|
|`AlertasRepositoryTypeOrm`|`IAlertasRepository`|TypeORM sobre PostgreSQL|Trabaja con `AlertaOrmEntity` y traduce vía `AlertaOrmMapper`|
|`EntidadesRepositoryTypeOrm`, `DireccionesRepositoryTypeOrm`|`IEntidadesRepository`, `IDireccionesRepository`|TypeORM|—|
|`NotificacionesRepositoryTypeOrm`|`INotificacionesRepository`|TypeORM|—|
|`LeaderboardSnapshotRepositoryRedis`|`ILeaderboardSnapshotRepository`|ioredis sobre Redis 7 (Sorted Set)|Esquema de claves en [Modelo de datos](modeloDeDatos.md)|
|`RetryQueueRedis`|`IRetryQueue`|ioredis sobre Redis 7 (List, `LPUSH`/`BRPOP`)|Backoff exponencial gestionado por `RetryWorker`|

</div>

> Las clases ORM (`AlertaOrmEntity`, etc.) son distintas de las entidades del dominio: llevan los decoradores de mapeo y se mantienen exclusivamente en `infrastructure/`. Los mappers ORM (`AlertaOrmMapper`, …) traducen en ambos sentidos. La entidad del dominio queda libre de tecnología.

### Adaptadores de sistemas externos

<div align=center>

|Adaptador|Implementa|Protocolo|Función|
|-|-|-|-|
|`HyperliquidConnector`|`IHyperliquidPort`|WebSocket|Mantiene la conexión con Hyperliquid L1 y publica `OperacionRecibida` y `PrecioActualizado` en el bus. **Único punto del sistema que conoce el protocolo**: sustituirlo por un adaptador para nodo no validador (RS-08) es cambiar la implementación inyectada|
|`WebhookConnectorHttp`|`IWebhookConnector`|HTTPS POST/HEAD|Comprueba alcanzabilidad y transmite notificaciones al webhook receptor. Cifrado/descifrado de la URL ocurre exclusivamente al traspasar la frontera (RS-10)|
|`HyperliquidMessageParser`|—|—|Parser puro de los mensajes de Hyperliquid; testeable sin red|

</div>

---

## Capa de presentación (`presentation/`)

### Controladores REST y gateways WebSocket

<div align=center>

|Clase|Estereotipo|Tipo de adaptador|Operaciones expuestas|Depende de|
|-|-|-|-|-|
|`AlertasController`|`<<controller>>`|REST `/alertas`|`POST`, `GET`, `PATCH`, `DELETE`|`IAlertasService`|
|`EntidadesController`|`<<controller>>`|REST `/entidades`|CRUD|`ICatalogoService`|
|`DireccionesController`|`<<controller>>`|REST `/entidades/:id/direcciones`|`POST`, `GET`, `DELETE`|`ICatalogoService`|
|`LeaderboardGateway`|`<<gateway>>`|WS `/ws/leaderboard`|`subscribe-leaderboard`, `unsubscribe-leaderboard`; reenvía `LeaderboardActualizado`|`ILeaderboardService`, `EventBus`|
|`DomainExceptionFilter`|`<<filter>>`|—|Traduce `DomainException` a códigos HTTP (404, 409, 422)|—|

</div>

> Los controladores reciben DTOs validados estructuralmente por el framework de validación; las reglas de negocio se validan en los servicios de aplicación (separación que se hereda del [Diseño de los CdU](disenoCdU.md)).

---

## Aplicación de los principios SOLID

<div align=center>

|Principio|Manifestación en el diseño|
|-|-|
|**S**RP — Single Responsibility|Cada clase tiene un propósito (crear alertas, evaluar precios, persistir, transmitir). `AlertasService` no conoce HTTP; `AlertasController` no conoce TypeORM|
|**O**CP — Open/Closed|Añadir un nuevo tipo de alerta requiere implementar `IEvaluadorAlerta` y registrarlo en el contenedor; no se modifican `PriceUpdateHandler` ni `AlertEvaluator` existentes|
|**L**SP — Liskov Substitution|`HyperliquidConnector` y un futuro `NodoNoValidadorConnector` cumplen `IHyperliquidPort`; sustituir uno por otro no rompe a `IngestionModule`|
|**I**SP — Interface Segregation|`ICatalogoService` (cliente: presentación) e `ICatalogoQueryService` (cliente: leaderboard, alertas) son interfaces distintas, aunque las implemente el mismo servicio. Análogo `IAlertasService` / `IAlertasQueryService`|
|**D**IP — Dependency Inversion|Todas las capas hacia adentro dependen de interfaces, no de implementaciones. La inyección se resuelve en los `@Module` con providers `{ provide: 'IXxx', useClass: XxxImpl }`|

</div>

## Patrones de diseño aplicados

<div align=center>

|Patrón|Dónde|Razón|
|-|-|-|
|**Repository**|`IAlertasRepository`, `IEntidadesRepository`, `ILeaderboardSnapshotRepository`|Encapsular acceso a la persistencia detrás de una interfaz del dominio|
|**Adapter**|`HyperliquidConnector`, `WebhookConnectorHttp`, `LeaderboardSnapshotRepositoryRedis`|Aislar el núcleo del protocolo concreto del exterior|
|**Strategy**|`AlertEvaluator` con futuras subclases por tipo de alerta|Permitir nuevos tipos de alerta sin tocar el handler|
|**Observer / Pub-Sub**|Subscripciones declarativas de eventos sobre el bus|Desacoplar productores y consumidores|
|**Template Method**|`DomainEvent` (base) con `eventName` abstracto|Estandarizar la forma de los eventos del dominio|
|**Command**|`CrearAlertaDto`, `EditarAlertaDto`|Encapsular la solicitud junto con sus parámetros, validable y serializable|
|**DTO + Mapper**|En cada borde del sistema|Evitar fugas del modelo de dominio hacia HTTP, BD o eventos|
|**Specification**|`Umbral.evaluar(precio): boolean`|Encapsular la regla del umbral como objeto del dominio|

</div>

## Diagrama de clases por módulo

### Módulo `AlertasModule`

<div align=center>

![Clases de diseño — AlertasModule](../../imagenes/capitulo3/diseno-clases-alertas.svg)

</div>

### Módulo `LeaderboardModule` + `IngestionModule`

<div align=center>

![Clases de diseño — Leaderboard e Ingestión](../../imagenes/capitulo3/diseno-clases-leaderboard.svg)

</div>

### Módulo `EvaluacionModule` + `NotificacionModule`

<div align=center>

![Clases de diseño — Evaluación y Notificación](../../imagenes/capitulo3/diseno-clases-evaluacion.svg)

</div>

### Módulo `CatalogoModule`

<div align=center>

![Clases de diseño — CatalogoModule](../../imagenes/capitulo3/diseno-clases-catalogo.svg)

</div>

## Trazabilidad análisis → diseño

<div align=center>

|Clase de análisis|Clase(s) de diseño|Mecanismo|
|-|-|-|
|`VistaLeaderboard`|`LeaderboardView` (componente de UI) + `LeaderboardClient` (cliente WS)|Componente UI + cliente de protocolo|
|`VistaEntidades`|`EntidadesListView`, `EntidadFormView`, `DireccionFormView`|Descomposición en componentes|
|`VistaAlertas`|`AlertasListView`, `AlertaFormView`|Descomposición en componentes|
|`ConectorHyperliquid`|`HyperliquidConnector` *(impl.)* + `IHyperliquidPort` *(interfaz)*|Adapter|
|`ConectorWebhook`|`WebhookConnectorHttp` + `IWebhookConnector`|Adapter|
|`GestorConsultaLeaderboard`|`LeaderboardService` + `OperationIngestionHandler`|Service + Event handler|
|`GestorCatalogoEntidades`|`CatalogoService` + `EntidadesRepository` + `DireccionesRepository`|Service + Repositorios|
|`GestorAlertasPrecio`|`AlertasService` + `AlertasRepository` + `IAlertasQueryService`|Service + Repositorio + interfaz especializada (ISP)|
|`GestorEvaluacionAlertas`|`PriceUpdateHandler` + `AlertEvaluator`|Handler + estrategia pura|
|`GestorEnvioNotificacion`|`AlertTriggeredHandler` + `NotificacionService` + `RetryWorker`|Handler + Service + Worker para reintentos|
|`LeaderboardEnVivo`|`LeaderboardSnapshotRepositoryRedis` + estructura Sorted Set|Repository + Estructura Redis|
|*Entidades del dominio*|Clases puras en `domain/` + `XxxOrmEntity` en `infrastructure/`|Separación dominio ↔ ORM|

</div>

## Validación del diseño de clases

<div align=center>

|Criterio|Comprobación|
|-|-|
|**Trazabilidad con análisis**|Cada clase de diseño se mapea a un rol de análisis. Cero clases huérfanas|
|**Inversión de dependencias**|Servicios de aplicación dependen de interfaces de puerto, no de tecnología concreta|
|**Tipado del dominio**|`Address`, `TokenSymbol`, `Volume` aparecen en lugar de tipos primitivos|
|**Encapsulación de mecanismos**|Eventos: solo en `domain/events/`. Persistencia: solo en `infrastructure/persistence/`. HTTP: solo en `presentation/http/`|
|**Cero dependencias inversas**|`domain/` no importa nada de las capas externas — comprobable con regla estática (cf. [Diseño de paquetes](disenoPaquetes.md))|

</div>

## Trazabilidad hacia el resto del capítulo y la implementación

<div align=center>

|Hacia|Compromiso|
|-|-|
|[Diseño de paquetes](disenoPaquetes.md)|La estructura de carpetas refleja la separación dominio/aplicación/infraestructura/presentación|
|[Modelo de datos](modeloDeDatos.md)|Cada `XxxOrmEntity` se materializa en una tabla; los `Sorted Set` de Redis siguen el esquema de claves|
|Capítulo 4|Las firmas y contratos aquí fijados son el contrato de implementación: el código se obtiene completando los cuerpos de método sin alterar el esqueleto|

</div>
