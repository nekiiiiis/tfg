# Infinite Fieldx — Herramientas en tiempo real sobre la L1 de Hyperliquid

Implementación de la solución descrita en los capítulos 1 y 2 del TFG. Provee:

- **Leaderboard en vivo** de actividad de direcciones por mercado, token y temporalidad (CU-01).
- **Catálogo de entidades y direcciones** con resolución de nombres (CU-02..CU-08), incluyendo vista de detalle global por dirección (saldos spot/perp/staking + últimas transacciones).
- **Alertas de precio con webhook**, evaluación automática y reintentos persistentes (CU-09..CU-14).

## Estructura del repositorio

```text
src/
├── docker-compose.yml          orquestación (app + postgres)
├── .env.example                variables de entorno documentadas
├── app/                        backend Node 20 + Fastify + TypeScript
│   ├── src/
│   │   ├── server.ts           entrypoint
│   │   ├── config.ts           configuración validada por zod
│   │   ├── bus.ts              EventEmitter del dominio
│   │   ├── domain/             modelo del dominio puro
│   │   ├── sources/            puerto IHyperliquidSource + adaptadores
│   │   ├── modules/            servicios + rutas por área funcional
│   │   ├── persistence/        Drizzle + esquema + migraciones
│   │   └── shared/             logger, health, errores comunes
│   ├── drizzle.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
└── web/                        frontend Vite + React + Tailwind + shadcn/ui
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── routes.tsx
    │   ├── core/               cliente HTTP/WS, tema
    │   ├── components/ui/      primitivas (shadcn/ui)
    │   ├── pages/              rutas top-level
    │   └── features/           CdU del front
    ├── package.json
    ├── vite.config.ts
    └── index.html
```

## Stack

| Capa | Tecnología |
|---|---|
| Runtime backend | Node 20 LTS |
| Framework HTTP/WS | Fastify 5 |
| ORM y migraciones | Drizzle ORM + Drizzle Kit |
| Cliente WS Hyperliquid | `ws` |
| Persistencia | PostgreSQL 16 (extensión `pgcrypto` para webhooks) |
| Bus de eventos | `EventEmitter` nativo |
| Validación I/O | `zod` + `fastify-type-provider-zod` |
| Frontend | Vite 8 + React 19 + Tailwind 4 + shadcn/ui |
| Realtime cliente | WebSocket nativo + reconexión exponencial |
| Gráficos | TradingView `lightweight-charts` + datafeed directo a Hyperliquid |

## Arranque rápido (desarrollo)

Requisitos: Node 20+, Docker y Docker Compose.

```bash
cp .env.example .env
docker compose up -d postgres                # levanta solo la BD
cd app && npm install && npm run db:migrate && npm run dev
# en otra terminal
cd web && npm install && npm run dev
```

- Backend en `http://localhost:3001`.
- Frontend en `http://localhost:5173` (proxy a `/api` y `/ws` apuntando al back).

## Despliegue (Docker Compose)

```bash
docker compose up -d --build
```

Levanta dos contenedores:

- `app` — Fastify sirviendo `/api/*`, `/ws/*` y los estáticos del SPA compilado.
- `postgres` — PostgreSQL 16 con volumen persistente.

## Sustituibilidad de la fuente de datos (RS-08)

El núcleo accede a Hyperliquid a través del puerto `IHyperliquidSource`. Dos implementaciones:

- `PublicWsAdapter` (por defecto, `HYPERLIQUID_SOURCE=public-ws`): WebSocket público `wss://api.hyperliquid.xyz/ws` + REST `https://api.hyperliquid.xyz/info`.
- `NanorethRpcAdapter` (esqueleto, `HYPERLIQUID_SOURCE=nanoreth`): JSON-RPC contra un nodo [nanoreth](https://github.com/hl-archive-node/nanoreth) local. Constructor y firmas listas; los cuerpos están a la espera de la integración real.

Cambiar de fuente es modificar `HYPERLIQUID_SOURCE` en `.env`. No se toca código del núcleo.

## Trazabilidad con el TFG

Cada CdU del capítulo 2 se materializa en este código. La trazabilidad detallada se publica en el capítulo 4 de la memoria.
