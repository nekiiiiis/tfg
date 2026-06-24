/**
 * Rutas REST del catálogo de mercados de Hyperliquid.
 *
 * El front las usa para:
 *   - Poblar el selector de tokens del leaderboard / alertas.
 *   - Conocer los dexes HIP-3 disponibles.
 *   - Forzar una recarga manual del catálogo si hace falta (debugging).
 *
 * El catálogo se cachea durante minutos en memoria (MetaService.ttl), por lo
 * que estas rutas no tocan a Hyperliquid en cada request.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MERCADOS,
  TEMPORALIDADES,
  type Mercado,
  type Temporalidad,
} from '../../domain/types.ts';
import type { HlChartInterval, MetaService } from './meta.service.ts';

const tokensQuery = z.object({
  mercado: z.enum(MERCADOS).optional(),
});

const HL_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
] as const satisfies readonly HlChartInterval[];

/** Misma tabla que el frontend (`core/domain.ts`). */
const CHART_BY_TEMPORALIDAD: Record<
  Temporalidad,
  { interval: HlChartInterval; lookbackMs: number }
> = {
  '1h': { interval: '1m', lookbackMs: 3_600_000 },
  '4h': { interval: '5m', lookbackMs: 14_400_000 },
  '6h': { interval: '5m', lookbackMs: 21_600_000 },
  '12h': { interval: '15m', lookbackMs: 43_200_000 },
  '1d': { interval: '1h', lookbackMs: 86_400_000 },
  '1w': { interval: '4h', lookbackMs: 604_800_000 },
};

const candlesQuery = z.object({
  mercado: z.enum(MERCADOS),
  token: z.string().min(1).max(64),
  temporalidad: z.enum(TEMPORALIDADES).optional(),
  interval: z.enum(HL_INTERVALS).optional(),
  lookbackMs: z.coerce.number().int().positive().max(604_800_000).optional(),
});

export function registerMetaRoutes(
  app: FastifyInstance,
  meta: MetaService,
): void {
  app.get('/meta/tokens', async (req) => {
    const q = tokensQuery.parse(req.query);
    const items = await meta.listTokens(q.mercado as Mercado | undefined);
    return {
      generadoEn: Date.now(),
      total: items.length,
      tokens: items.map((t) => ({
        mercado: t.mercado,
        id: t.id,
        label: t.label,
        base: t.base,
        quote: t.quote,
        dex: t.dex,
        feedCoin: t.feedCoin,
        midsKey: t.midsKey,
        szDecimals: t.szDecimals,
      })),
    };
  });

  app.get('/meta/perp-dexs', async () => {
    const dexs = await meta.listPerpDexs();
    return { dexs };
  });

  app.post('/meta/refresh', async () => {
    const cat = await meta.refresh();
    return {
      tokens: cat.tokens.length,
      dexs: cat.dexs.length,
      generadoEn: cat.generatedAt,
    };
  });

  const topVolumenQuery = z.object({
    limit: z.coerce.number().int().positive().max(200).optional(),
  });
  app.get('/meta/top-volumen', async (req) => {
    const q = topVolumenQuery.parse(req.query);
    const items = await meta.getTopByVolume(q.limit ?? 40);
    return {
      generadoEn: Date.now(),
      total: items.length,
      tokens: items,
    };
  });

  app.get('/meta/candles', async (req) => {
    const q = candlesQuery.parse(req.query);
    const chart =
      q.temporalidad != null
        ? CHART_BY_TEMPORALIDAD[q.temporalidad]
        : {
            interval: q.interval ?? '1h',
            lookbackMs: q.lookbackMs ?? 86_400_000,
          };
    const { feedCoin, velas } = await meta.getCandles(
      q.mercado as Mercado,
      q.token,
      chart.interval,
      chart.lookbackMs,
    );
    return {
      generadoEn: Date.now(),
      mercado: q.mercado,
      token: q.token,
      feedCoin,
      interval: chart.interval,
      velas,
    };
  });
}
