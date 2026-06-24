/**
 * Tabla `lb_trades`: persistencia continua de trades del leaderboard.
 *
 * Sirve para dos cosas:
 *   1. Que al hacer `subscribe(terna)` el snapshot inicial use los trades de
 *      las **últimas N horas reales** (1h, 4h, 6h, 12h, 1d, 1w), no solo los
 *      ~500 últimos que devuelve `recentTrades`.
 *   2. Recuperarse de reinicios del backend sin perder cobertura.
 *
 * Diseño:
 *   - PK = `tid` (hash del trade en HL): dedupe natural entre WS y REST.
 *   - Índice por `(mercado, token, ts)` para hacer la query de ventana barata.
 *   - Retención: el job de limpieza borra todo lo más antiguo de 8 días
 *     (ventana 1w + margen).
 */

import { sql } from 'drizzle-orm';
import {
  char,
  doublePrecision,
  index,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';

export const lbTrades = pgTable(
  'lb_trades',
  {
    tid: text('tid').primaryKey(),
    mercado: varchar('mercado', { length: 16 }).notNull(),
    token: varchar('token', { length: 64 }).notNull(),
    direccion: char('direccion', { length: 42 }).notNull(),
    /** 'BUY' | 'SELL'. */
    lado: varchar('lado', { length: 4 }).notNull(),
    /** Volumen en USD (positivo). */
    volumenUsd: doublePrecision('volumen_usd').notNull(),
    /** Epoch milliseconds del trade. */
    ts: doublePrecision('ts').notNull(),
  },
  (t) => ({
    porVentana: index('lb_trades_ventana').on(t.mercado, t.token, t.ts),
    porTs: index('lb_trades_ts').on(t.ts),
  }),
);

export type LbTrade = typeof lbTrades.$inferSelect;
export type NuevoLbTrade = typeof lbTrades.$inferInsert;
