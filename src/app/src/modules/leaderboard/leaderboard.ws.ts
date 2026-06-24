/**
 * Gateway WebSocket del leaderboard (CU-01).
 *
 * Protocolo cliente↔servidor (JSON line):
 *
 *   c→s:  { "type": "subscribe-leaderboard", "mercado": "...", "token": "...",
 *           "temporalidad": "...", "lado": "ALL|BUY|SELL", "topN": 200 }
 *   c→s:  { "type": "unsubscribe-leaderboard", "mercado": "...", "token": "...",
 *           "temporalidad": "..." }
 *   c→s:  { "type": "subscribe-mids" }
 *   c→s:  { "type": "unsubscribe-mids" }
 *   c→s:  { "type": "ping" }
 *
 *   s→c:  { "type": "snapshot", "terna": {...}, "lado": "ALL", "filas": [...], "ts": 123 }
 *   s→c:  { "type": "update",   "terna": {...}, "lado": "ALL", "filas": [...], "ts": 123 }
 *   s→c:  { "type": "mids",     "mids": {...}, "ts": 123 }
 *   s→c:  { "type": "error",    "message": "...", "code": "..." }
 *   s→c:  { "type": "pong" }
 *
 * Política importante (anti rate-limit):
 *   - El servidor NO abre canales hacia Hyperliquid hasta que el cliente envía
 *     `subscribe-leaderboard` con `mercado` + `token` + `temporalidad` válidos.
 *   - Mientras el cliente "explora" la UI no se consume cuota.
 *   - Cada terna activa por cliente lleva sus propios `lado` y `topN`, que se
 *     aplican al filtrar las actualizaciones.
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { bus } from '../../bus.ts';
import { logger } from '../../shared/logger.ts';
import {
  LADOS,
  MERCADOS,
  TEMPORALIDADES,
  type Lado,
  type Terna,
} from '../../domain/types.ts';
import type {
  IHyperliquidSource,
  Unsubscribe,
} from '../../sources/hyperliquid.port.ts';
import type { LeaderboardService } from './leaderboard.service.ts';
import { DEFAULT_TOP_N, HARD_TOP_N_CAP } from './leaderboard.service.ts';
import type { MetaService } from '../meta/meta.service.ts';

const ternaSchema = z.object({
  mercado: z.enum(MERCADOS),
  token: z.string().min(1).max(64),
  temporalidad: z.enum(TEMPORALIDADES),
});

const subscribeShape = ternaSchema.extend({
  lado: z.enum(LADOS).optional(),
  topN: z.coerce.number().int().positive().max(HARD_TOP_N_CAP).optional(),
});

const inboundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe-leaderboard') }).extend(subscribeShape.shape),
  z.object({ type: z.literal('subscribe-mids') }),
  z
    .object({ type: z.literal('unsubscribe-leaderboard') })
    .extend(ternaSchema.shape),
  z.object({ type: z.literal('unsubscribe-mids') }),
  z.object({ type: z.literal('ping') }),
]);

interface TernaPrefs {
  lado: Lado;
  topN: number;
  unsubscribe: () => void;
}

interface ClientState {
  /** Por terna → preferencias + función para liberar la suscripción al servicio. */
  ternas: Map<string, TernaPrefs>;
  /** Suscripción al feed de mids (compartido). */
  midsUnsub?: Unsubscribe;
  /** Listener del bus para `LeaderboardActualizado`. */
  busOff?: () => void;
}

const ternaKey = (t: Terna): string =>
  `${t.mercado}|${t.token.toUpperCase()}|${t.temporalidad}`;

export function registerLeaderboardGateway(
  fastify: FastifyInstance,
  service: LeaderboardService,
  source: IHyperliquidSource,
  meta: MetaService,
): void {
  fastify.get('/ws/leaderboard', { websocket: true }, (socket, req) => {
    const ws = socket as WebSocket;
    const remote = req.ip;
    const state: ClientState = { ternas: new Map() };
    logger.info({ remote }, 'WS cliente conectado');

    state.busOff = bus.on('LeaderboardActualizado', (e) => {
      const key = ternaKey(e.terna);
      const prefs = state.ternas.get(key);
      if (!prefs) return;
      const filas = filtrarPorLado(e.topN, prefs.lado, prefs.topN);
      sendJson(ws, {
        type: 'update',
        terna: e.terna,
        lado: prefs.lado,
        filas,
        ts: e.ocurridoEn,
      });
    });

    ws.on('message', async (raw) => {
      let parsed: z.infer<typeof inboundSchema>;
      try {
        parsed = inboundSchema.parse(JSON.parse(raw.toString()));
      } catch (err) {
        sendJson(ws, {
          type: 'error',
          code: 'BAD_MESSAGE',
          message: (err as Error).message,
        });
        return;
      }
      try {
        await handleClientMessage(ws, state, service, source, meta, parsed);
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'WS handler error');
        sendJson(ws, {
          type: 'error',
          code: 'INTERNAL',
          message: (err as Error).message,
        });
      }
    });

    ws.on('close', () => {
      logger.info({ remote }, 'WS cliente desconectado');
      for (const prefs of state.ternas.values()) {
        try {
          prefs.unsubscribe();
        } catch {
          /* ignore */
        }
      }
      state.ternas.clear();
      state.midsUnsub?.();
      state.midsUnsub = undefined;
      state.busOff?.();
    });
  });
}

async function handleClientMessage(
  ws: WebSocket,
  state: ClientState,
  service: LeaderboardService,
  source: IHyperliquidSource,
  meta: MetaService,
  msg: z.infer<typeof inboundSchema>,
): Promise<void> {
  switch (msg.type) {
    case 'ping':
      sendJson(ws, { type: 'pong' });
      return;
    case 'subscribe-leaderboard': {
      const terna: Terna = {
        mercado: msg.mercado,
        token: msg.token,
        temporalidad: msg.temporalidad,
      };
      const lado: Lado = msg.lado ?? 'ALL';
      const topN = msg.topN ?? DEFAULT_TOP_N;
      const key = ternaKey(terna);
      const existing = state.ternas.get(key);
      if (existing) {
        // Misma terna: refrescamos preferencias y reenviamos snapshot.
        existing.lado = lado;
        existing.topN = topN;
        const snap = service.snapshot(terna, topN, lado);
        sendJson(ws, {
          type: 'snapshot',
          terna: snap.terna,
          lado,
          filas: snap.filas,
          ts: snap.generadoEn,
        });
        return;
      }
      const { snapshot, unsubscribe } = await service.subscribe(terna, {
        lado,
        topN,
      });
      state.ternas.set(key, { lado, topN, unsubscribe });
      sendJson(ws, {
        type: 'snapshot',
        terna: snapshot.terna,
        lado,
        filas: snapshot.filas,
        ts: snapshot.generadoEn,
      });
      return;
    }
    case 'unsubscribe-leaderboard': {
      const terna: Terna = {
        mercado: msg.mercado,
        token: msg.token,
        temporalidad: msg.temporalidad,
      };
      const key = ternaKey(terna);
      const prefs = state.ternas.get(key);
      if (prefs) {
        try {
          prefs.unsubscribe();
        } catch {
          /* ignore */
        }
        state.ternas.delete(key);
      }
      return;
    }
    case 'subscribe-mids': {
      if (state.midsUnsub) return;
      // Aseguramos catálogo cargado para mapear midsKey→display token.
      try {
        await meta.getCatalog();
      } catch {
        /* el callback usará el mapa vacío y al menos llegarán claves crudas */
      }
      state.midsUnsub = await source.subscribeAllMids((mids) => {
        const map = meta.getMidsKeyToDisplay();
        const translated: Record<string, number> = {};
        for (const [k, v] of Object.entries(mids)) {
          const display = map.get(k);
          translated[display ?? k] = v;
        }
        sendJson(ws, { type: 'mids', mids: translated, ts: Date.now() });
      });
      return;
    }
    case 'unsubscribe-mids': {
      state.midsUnsub?.();
      state.midsUnsub = undefined;
      return;
    }
  }
}

/**
 * Aplica `lado` y `topN` a las filas que ya vienen pre-ordenadas por compra+venta
 * del bus. Cuando el cliente pide BUY o SELL, reordenamos por ese lado y filtramos
 * filas sin actividad en él.
 */
function filtrarPorLado(
  filas: ReadonlyArray<{
    direccion: string;
    volumenCompra: number;
    volumenVenta: number;
  }>,
  lado: Lado,
  topN: number,
): Array<{ direccion: string; volumenCompra: number; volumenVenta: number }> {
  let out = filas.slice();
  if (lado === 'BUY') {
    out = out.filter((f) => f.volumenCompra > 0);
    out.sort((a, b) => b.volumenCompra - a.volumenCompra);
  } else if (lado === 'SELL') {
    out = out.filter((f) => f.volumenVenta > 0);
    out.sort((a, b) => b.volumenVenta - a.volumenVenta);
  }
  if (topN > 0 && out.length > topN) out.length = topN;
  return out;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err: String(err) }, 'WS send failed');
  }
}
