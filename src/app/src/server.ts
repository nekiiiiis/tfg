/**
 * Entrypoint del backend.
 *
 * Bootea Fastify, registra plugins, conecta los servicios al bus, expone
 * REST + WebSocket y sirve el SPA compilado del frontend.
 *
 * En desarrollo el SPA se sirve con `vite dev` aparte (proxy a /api y /ws);
 * en producción el bundle vive en `app/public` y Fastify lo sirve.
 */

import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticFiles from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, leaderboardWindowSeconds } from './config.ts';
import { logger } from './shared/logger.ts';
import { attachErrorHandler } from './shared/errors.ts';
import { registerHealth } from './shared/health.ts';
import { createHyperliquidSource } from './sources/index.ts';
import { LeaderboardService } from './modules/leaderboard/leaderboard.service.ts';
import { registerLeaderboardGateway } from './modules/leaderboard/leaderboard.ws.ts';
import { LeaderboardBalancesService } from './modules/leaderboard/leaderboard-balances.service.ts';
import { registerLeaderboardBalancesRoutes } from './modules/leaderboard/leaderboard-balances.routes.ts';
import { TradePersistence } from './modules/leaderboard/trade-persistence.service.ts';
import { ensureLbTradesSchema } from './persistence/ensure-schema.ts';
import { registerCatalogoRoutes } from './modules/catalogo/catalogo.routes.ts';
import { registerAlertasRoutes } from './modules/alertas/alertas.routes.ts';
import { registerDireccionDetalleRoutes } from './modules/direccion-detalle/direccion-detalle.routes.ts';
import { registerMetaRoutes } from './modules/meta/meta.routes.ts';
import { CatalogoService } from './modules/catalogo/catalogo.service.ts';
import { AlertasService } from './modules/alertas/alertas.service.ts';
import { AddressDetailService } from './modules/direccion-detalle/address-detail.service.ts';
import { MetaService } from './modules/meta/meta.service.ts';
import { NotificacionService } from './modules/notificacion/notificacion.service.ts';
import { WebhookConnector } from './modules/notificacion/webhook.connector.ts';
import { startRetryWorker } from './modules/notificacion/retry.worker.ts';
import { wireEvaluacion } from './modules/evaluacion/evaluacion.subscriber.ts';
import { sql, db } from './persistence/db.ts';
import { bus as busRef } from './bus.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap(): Promise<void> {
  const fastify = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  attachErrorHandler(fastify);

  await fastify.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
  });
  await fastify.register(websocket, {
    options: { maxPayload: 1_048_576 },
  });

  // ---- componentes del dominio ----
  const source = createHyperliquidSource();
  const metaService = new MetaService({ infoUrl: config.HYPERLIQUID_INFO_URL });
  // Precarga el catálogo de tokens en background (no bloqueante).
  metaService.getCatalog().catch((err) => {
    logger.warn(
      { err: (err as Error).message },
      'MetaService: precarga del catálogo falló (se reintentará bajo demanda)',
    );
  });
  // Persistencia continua de trades en Postgres para alimentar ventanas
  // largas (1d, 1w). Idempotente: crea la tabla si no existe.
  await ensureLbTradesSchema(sql);
  const tradePersistence = new TradePersistence(sql);
  tradePersistence.start();

  const leaderboardService = new LeaderboardService(
    source,
    metaService,
    leaderboardWindowSeconds,
    config.LEADERBOARD_MAX_OPS_PER_TERNA,
    {
      minIntervalMs: config.LEADERBOARD_POLL_MIN_MS,
      maxIntervalMs: config.LEADERBOARD_POLL_MAX_MS,
      wsFreshMs: config.LEADERBOARD_POLL_WS_FRESH_MS,
      freshIntervalMs: config.LEADERBOARD_POLL_FRESH_MS,
    },
    tradePersistence,
  );

  // Alimentación del bus con `PrecioActualizado` derivado de `allMids`.
  //
  // Las claves crudas de `allMids` son `@<idx>` para spot, `BTC` para perp
  // nativo y `<dex>:<symbol>` para HIP3. Aquí traducimos cada clave al
  // *display token* (HYPE/USDC, BTC.p, xyz:SP500) usando el MetaService.
  //
  // El mapa midsKey→display se construye una sola vez a partir del catálogo y
  // se refresca en background sólo si llegan claves desconocidas Y han pasado
  // más de N ms desde la última recarga; así evitamos tormentas de /info.
  const midsKeyToDisplay = new Map<string, string>();
  const recargarMapaMids = async (): Promise<void> => {
    try {
      const cat = await metaService.getCatalog();
      for (const t of cat.tokens) midsKeyToDisplay.set(t.midsKey, t.id);
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        'No se pudo construir el mapa midsKey→display (se reintentará)',
      );
    }
  };
  await recargarMapaMids();
  let pendingMidsReload = false;
  let lastReloadAttemptAt = 0;
  const RELOAD_MIN_INTERVAL_MS = 5 * 60_000;

  const lastMids: Record<string, number> = {};
  await source.subscribeAllMids((mids) => {
    const ts = Date.now();
    let unknownCount = 0;
    let totalChanges = 0;
    for (const [midsKey, valor] of Object.entries(mids)) {
      const prev = lastMids[midsKey];
      if (prev === valor) continue;
      lastMids[midsKey] = valor;
      totalChanges += 1;
      const display = midsKeyToDisplay.get(midsKey);
      if (!display) unknownCount += 1;
      busRef.emit('PrecioActualizado', {
        name: 'PrecioActualizado',
        ocurridoEn: ts,
        precio: { token: display ?? midsKey, valor, ts },
      });
    }
    // Recargar el catálogo sólo cuando: (a) ha pasado el intervalo mínimo,
    // (b) no hay otra recarga en curso, y (c) hay un volumen significativo de
    // claves desconocidas (>=5 o ≥10% del batch). Esto evita tormentas.
    if (pendingMidsReload) return;
    if (ts - lastReloadAttemptAt < RELOAD_MIN_INTERVAL_MS) return;
    if (totalChanges === 0) return;
    const ratio = unknownCount / totalChanges;
    if (unknownCount < 5 && ratio < 0.1) return;
    pendingMidsReload = true;
    lastReloadAttemptAt = ts;
    logger.info(
      { unknownCount, totalChanges },
      'Detectadas claves nuevas en allMids: refrescando catálogo',
    );
    metaService
      .refresh()
      .then(() => recargarMapaMids())
      .catch(() => undefined)
      .finally(() => {
        pendingMidsReload = false;
      });
  });

  const catalogoService = new CatalogoService(db);
  const webhookConnector = new WebhookConnector();
  const notificacionService = new NotificacionService(db, webhookConnector);
  const alertasService = new AlertasService(db, webhookConnector);
  const addressDetailService = new AddressDetailService(
    source,
    metaService,
    (midsKey) => lastMids[midsKey],
  );
  const leaderboardBalancesService = new LeaderboardBalancesService(
    { infoUrl: config.HYPERLIQUID_INFO_URL },
    metaService,
  );
  wireEvaluacion(db, notificacionService);

  // ---- rutas + WS ----
  registerHealth(fastify, { source, sql });
  registerLeaderboardGateway(fastify, leaderboardService, source, metaService);
  await fastify.register(async (api) => {
    registerCatalogoRoutes(api, catalogoService);
    registerAlertasRoutes(api, alertasService);
    registerDireccionDetalleRoutes(api, addressDetailService);
    registerMetaRoutes(api, metaService);
    registerLeaderboardBalancesRoutes(api, leaderboardBalancesService);
  }, { prefix: '/api' });

  // ---- SPA estático (producción) ----
  // `@fastify/static` no lanza pero sí emite un WARN si `root` no existe;
  // como en desarrollo el SPA lo sirve Vite y `app/public` no se compila,
  // comprobamos la existencia antes de registrar el plugin.
  const publicDir = path.resolve(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    await fastify.register(staticFiles, {
      root: publicDir,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    });
    // Fallback para rutas del SPA: sirve index.html sin tirar 404.
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws') || req.url === '/health') {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      }
      return reply.sendFile('index.html');
    });
  } else {
    logger.info(
      { publicDir },
      'SPA estático no servido (carpeta public ausente, normal en desarrollo)',
    );
  }

  // ---- workers ----
  const stopRetryWorker = startRetryWorker(db, notificacionService);

  // ---- arranque ----
  try {
    await fastify.listen({ host: config.HOST, port: config.PORT });
    logger.info(
      { url: `http://${config.HOST}:${config.PORT}` },
      'Servidor escuchando',
    );
  } catch (err) {
    logger.fatal({ err }, 'Fallo al arrancar el servidor');
    process.exit(1);
  }

  // ---- prewarm de canales del leaderboard ----
  // Para cada par configurado en LEADERBOARD_PREWARM hacemos un subscribe
  // efímero: abre el canal (WS de trades + polling REST + persistencia en
  // `lb_trades`) y al des-suscribirnos el canal pasa, tras
  // CHANNEL_IDLE_GRACE_MS, al estado `keepAlive` del LeaderboardService;
  // así sigue capturando datos 24/7 sin requerir clientes conectados.
  //
  // Se ejecuta en background tras `listen` para no retrasar la apertura del
  // puerto (los suscribes lanzan REST contra Hyperliquid y leen historial de
  // BD; pueden tardar segundos).
  if (config.LEADERBOARD_PREWARM.length > 0) {
    void (async () => {
      const pares = config.LEADERBOARD_PREWARM;
      logger.info({ count: pares.length, pares }, 'Prewarm: iniciando canales');
      const results = await Promise.allSettled(
        pares.map(async ({ mercado, token }) => {
          const { unsubscribe } = await leaderboardService.subscribe(
            { mercado, token, temporalidad: '1h' },
            { topN: 1 },
          );
          unsubscribe();
          return { mercado, token };
        }),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      for (let i = 0; i < results.length; i += 1) {
        const res = results[i]!;
        if (res.status === 'rejected') {
          logger.warn(
            { par: pares[i], err: (res.reason as Error)?.message ?? String(res.reason) },
            'Prewarm: par no se pudo abrir (se reintentará al primer subscribe real)',
          );
        }
      }
      logger.info(
        { ok, fail, total: pares.length },
        'Prewarm: canales solicitados (pasarán a keep-alive tras grace period)',
      );
    })();
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Iniciando cierre ordenado');
    stopRetryWorker();
    await fastify.close();
    await leaderboardService.close();
    await tradePersistence.stop();
    await source.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
