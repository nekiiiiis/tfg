# Diseño de paquetes

Concreta los paquetes del [análisis de paquetes](analisisPaquetes.md) en una **estructura física de directorios** del repositorio que materializa las decisiones del [diseño de la arquitectura](disenoArquitectura.md). La estructura preserva el bajo acoplamiento y la alta cohesión, y favorece la trazabilidad caso de uso ↔ directorio.

## Decisiones de organización

<div align=center>

|Decisión|Justificación|
|-|-|
|**Monorepo con dos paquetes raíz** (`src/app/`, `src/web/`)|Backend y frontend comparten lenguaje y herramientas pero tienen ciclos de vida y dependencias independientes|
|**Organización por feature** (no por capa) dentro del backend|Cada caso de uso se concentra en un único subdirectorio bajo `modules/`, con sus rutas, servicios y eventuales tipos. Reduce el coste cognitivo de modificar un CdU|
|**`domain/` separado y puro**|Tipos, eventos y errores no dependen de Fastify, Drizzle ni HTTP; reutilizables por servicios, gateways y futuros adaptadores|
|**`sources/` separado** del resto de módulos|Concentra la integración con Hyperliquid (puerto + adaptadores); permite que el cambio de fuente (RS-08) afecte a un único directorio|
|**`persistence/` separado**|Esquemas Drizzle + migraciones + helpers de cifrado vivienen en un único lugar; los servicios usan el handle `db` exportado|
|**Composition root único** en `server.ts`|Concentra el cableado de dependencias; el resto del código depende de interfaces o servicios inyectados|

</div>

## Estructura del backend (`src/app/`)

```
src/app/
├── Dockerfile                    # multi-stage build (web → app → runtime Node 20)
├── package.json                  # dependencias y scripts
├── drizzle.config.ts             # configuración del migrador
├── tsconfig.json
└── src/
    ├── server.ts                 # composition root + bootstrap Fastify
    ├── config.ts                 # configuración validada por Zod
    ├── bus.ts                    # bus de eventos tipado in-process
    │
    ├── domain/                   # DOMINIO — capa pura, sin dependencias
    │   ├── types.ts              # Mercado, Token, Direccion, Operacion, Precio, Terna, Umbral, …
    │   ├── events.ts             # DomainEventMap + tipos de eventos
    │   └── errors.ts             # DomainError + especializaciones
    │
    ├── sources/                  # INFRAESTRUCTURA — frontera con Hyperliquid (S-INGE)
    │   ├── hyperliquid.port.ts   # puerto IHyperliquidSource
    │   ├── public-ws.adapter.ts  # adaptador WS público + REST /info
    │   ├── nanoreth-rpc.adapter.ts # adaptador esqueleto para nodo no validador
    │   └── index.ts              # factory createHyperliquidSource()
    │
    ├── modules/                  # APLICACIÓN + presentación, organizado por feature
    │   ├── leaderboard/          # S-LEAD
    │   │   ├── leaderboard.service.ts
    │   │   ├── leaderboard.state.ts
    │   │   ├── trade-persistence.service.ts
    │   │   ├── leaderboard-balances.service.ts
    │   │   ├── leaderboard-balances.routes.ts
    │   │   └── leaderboard.ws.ts            # gateway WS
    │   ├── catalogo/             # S-CATA — entidades y direcciones
    │   │   ├── catalogo.service.ts
    │   │   └── catalogo.routes.ts
    │   ├── meta/                 # S-CATA — catálogo de Hyperliquid
    │   │   ├── meta.service.ts
    │   │   └── meta.routes.ts
    │   ├── direccion-detalle/    # S-CATA — flujo alternativo CU-07
    │   │   ├── address-detail.service.ts
    │   │   └── direccion-detalle.routes.ts
    │   ├── alertas/              # S-ALER
    │   │   ├── alertas.service.ts
    │   │   └── alertas.routes.ts
    │   ├── evaluacion/           # S-EVAL
    │   │   ├── evaluator.ts                 # función pura
    │   │   └── evaluacion.subscriber.ts     # wireEvaluacion (suscriptor del bus)
    │   └── notificacion/         # S-NOTI
    │       ├── notificacion.service.ts
    │       ├── webhook.connector.ts
    │       └── retry.worker.ts
    │
    ├── persistence/              # INFRAESTRUCTURA — PostgreSQL + Drizzle
    │   ├── db.ts                 # cliente postgres-js + handle Drizzle
    │   ├── crypto.ts             # helpers pgp_sym_encrypt/decrypt
    │   ├── ensure-schema.ts      # auto-creación idempotente de lb_trades
    │   ├── migrate.ts            # script de migraciones (drizzle-kit)
    │   ├── schema/               # esquemas Drizzle (uno por tabla)
    │   │   ├── entidades.ts
    │   │   ├── direcciones.ts
    │   │   ├── alertas.ts
    │   │   ├── notificaciones.ts
    │   │   ├── lb_trades.ts
    │   │   └── index.ts
    │   └── migrations/           # SQL generado
    │       ├── 0000_init.sql
    │       └── 0001_lb_trades.sql
    │
    └── shared/                   # transversal
        ├── logger.ts             # pino + transport pino-pretty en dev
        ├── errors.ts             # mapeo DomainError → HTTP
        └── health.ts             # GET /health
```

### Mapeo paquete de análisis → directorio

<div align=center>

|Paquete de análisis|Directorio del código|
|-|-|
|`presentacion` *(back)*|`modules/*/(*.routes.ts \| *.ws.ts)`|
|`presentacion` *(front)*|`web/src/pages/`, `web/src/features/`|
|`ingestion`|`sources/`|
|`leaderboard`|`modules/leaderboard/`|
|`catalogo`|`modules/catalogo/` + `modules/meta/` + `modules/direccion-detalle/`|
|`alertas`|`modules/alertas/`|
|`evaluacion`|`modules/evaluacion/`|
|`notificacion`|`modules/notificacion/`|
|`dominio`|`domain/` + esquemas Drizzle en `persistence/schema/`|

</div>

> El análisis previó la descomposición del paquete `catalogo` en submódulos por agregado; el diseño confirma esa descomposición: `catalogo/` (entidades y direcciones de negocio), `meta/` (catálogo de Hyperliquid) y `direccion-detalle/` (lectura agregada para CU-07). Esta separación responde a SRP — cada submódulo tiene una sola razón de cambio.

## Estructura del frontend (`src/web/`)

```
src/web/
├── package.json                  # Vite + React 19 + Tailwind 4 + shadcn/ui
├── vite.config.ts
├── tailwind.config.ts
└── src/
    ├── main.tsx                  # bootstrap React
    ├── App.tsx                   # routing global
    ├── index.css                 # tema Tailwind
    │
    ├── pages/                    # PÁGINAS — una por boundary primaria del análisis
    │   ├── LeaderboardPage.tsx   # CU-01
    │   ├── EntidadesPage.tsx     # CU-02..05
    │   ├── EntidadDetailPage.tsx # CU-06..08
    │   ├── DireccionDetailPage.tsx # extensión CU-07
    │   └── AlertasPage.tsx       # CU-09..12
    │
    ├── features/                 # COMPONENTES ESPECÍFICOS POR FEATURE
    │   ├── leaderboard/
    │   │   ├── LeaderboardTable.tsx
    │   │   ├── LeaderboardFilters.tsx
    │   │   ├── PriceTicker.tsx
    │   │   ├── LightweightChart.tsx
    │   │   └── useBalances.ts
    │   ├── catalogo/
    │   │   ├── EntidadForm.tsx
    │   │   └── DireccionForm.tsx
    │   └── alertas/
    │       └── AlertaForm.tsx
    │
    ├── components/               # PRIMITIVOS / TRANSVERSALES
    │   ├── ui/                   # button, card, dialog, select, combobox, tabs, …
    │   └── HealthIndicator.tsx
    │
    └── core/                     # NÚCLEO COMPARTIDO
        ├── api.ts                # cliente HTTP + tipos compartidos con backend
        ├── domain.ts             # tipos/lógica de presentación (parámetros de gráfico, agrupación tokens)
        ├── AppDataContext.tsx    # estado global: catálogo, WS único de leaderboard, mids
        ├── format.ts             # formateadores USD, direcciones, fechas
        └── cn.ts                 # utilidad de Tailwind
```

`AppDataContext` agrupa los tres elementos compartidos por todas las vistas (catálogo precargado, conexión WS al leaderboard y mids en vivo) y los expone con un proveedor de React. Las páginas consumen el contexto y son ignorantes de los detalles de transporte.

## Dependencias entre paquetes

Las dependencias dentro del backend siguen el grafo del análisis. La dirección es siempre hacia el dominio o hacia la infraestructura, nunca al revés:

<div align=center>

|Dependencia|Naturaleza técnica|
|-|-|
|`modules/leaderboard/` → `sources/` *(vía puerto)*|Inyección de `IHyperliquidSource`|
|`modules/leaderboard/` → `persistence/` *(vía handle Drizzle)*|`TradePersistence` recibe `sql`|
|`modules/leaderboard/` → `modules/meta/`|`LeaderboardService` recibe `MetaService` para resolver `feedCoin`|
|`modules/leaderboard/` → `bus.ts`|Publica `LeaderboardActualizado`|
|`modules/leaderboard/leaderboard.ws.ts` → `modules/leaderboard/leaderboard.service.ts`|Gateway → servicio (mismo módulo)|
|`modules/leaderboard/leaderboard.ws.ts` → `bus.ts`|Suscribe `LeaderboardActualizado`|
|`modules/evaluacion/` → `bus.ts`|Suscribe `PrecioActualizado`|
|`modules/evaluacion/` → `persistence/`|Consulta directa a `alertas` y `notificaciones`|
|`modules/evaluacion/` → `modules/notificacion/`|Delegación CU-13 → CU-14|
|`modules/notificacion/` → `persistence/`|`NotificacionService` actualiza `notificaciones`|
|`modules/notificacion/` → `bus.ts`|Publica `NotificacionConfirmada` / `NotificacionFallida`|
|`modules/alertas/` → `modules/notificacion/`|Verificación de alcanzabilidad del webhook|
|`modules/*/*.routes.ts` → `domain/`|DTOs Zod basados en tipos del dominio|
|*todos los módulos* → `shared/logger.ts`|Logging|

</div>

Las dependencias forman un DAG. El único punto donde se concentra el conocimiento de implementaciones concretas es `server.ts` (composition root); el resto del código depende de interfaces o servicios ya inyectados.

## Tamaño y mantenimiento

<div align=center>

|Subsistema|Archivos|Comentario|
|-|-|-|
|S-LEAD|6|Concentra la complejidad del CU-01; cada archivo tiene una responsabilidad clara|
|S-CATA|3 módulos (`catalogo`, `meta`, `direccion-detalle`) con 2 archivos cada uno|División por agregado para mantener archivos < 300 líneas|
|S-ALER|2|`alertas.service.ts` con `crear`/`listar`/`actualizar`/`eliminar`|
|S-EVAL|2|Función pura + suscriptor; el suscriptor es muy corto|
|S-NOTI|3|Servicio principal + adaptador HTTP + worker|

</div>

Todos los archivos del backend se mantienen por debajo de 700 líneas, dimensión que IdSw2 considera comprensible "de un vistazo" para módulos cohesivos.

## Diagrama

<div align=center>

![Paquetes de diseño](../../imagenes/capitulo3/diseno-paquetes.svg)

</div>
