/**
 * Persistencia continua de trades del leaderboard en Postgres.
 *
 * Cada `Operacion` que el `LeaderboardService` recibe (por WS o por REST) se
 * encola en memoria y se vuelca a la tabla `lb_trades` en batches:
 *   - cada `flushIntervalMs` ms (por defecto 500 ms)
 *   - o cuando el buffer supera `flushBatchSize` (por defecto 1000 ops)
 *
 * El INSERT usa `ON CONFLICT (tid) DO NOTHING` para que el WS y el REST puedan
 * convivir sin que se duplique nada.
 *
 * Limpieza: un timer cada `cleanupIntervalMs` (por defecto 1h) borra los
 * trades más antiguos de `retentionDays` (por defecto 8 días). 1w + margen.
 *
 * Lectura: `getHistorical(mercado, token, sinceMs)` devuelve los trades de
 * la ventana ordenados de más antiguo a más reciente, lo que el state ya
 * espera para `ingestBackfill`.
 */

import type postgres from 'postgres';
import { logger } from '../../shared/logger.ts';
import type { Mercado, Operacion } from '../../domain/types.ts';

export interface TradePersistenceOptions {
  /** Trades acumulados antes de forzar flush. */
  flushBatchSize?: number;
  /** Intervalo (ms) del flush periódico. */
  flushIntervalMs?: number;
  /** Días de retención antes de purgar. */
  retentionDays?: number;
  /** Intervalo (ms) del cleanup. */
  cleanupIntervalMs?: number;
  /** Si `false` no se persiste nada (útil para tests). */
  enabled?: boolean;
}

export class TradePersistence {
  private buffer: Operacion[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private readonly flushBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly retentionDays: number;
  private readonly cleanupIntervalMs: number;
  private readonly enabled: boolean;

  constructor(
    private readonly sql: postgres.Sql,
    opts: TradePersistenceOptions = {},
  ) {
    this.flushBatchSize = opts.flushBatchSize ?? 1000;
    this.flushIntervalMs = opts.flushIntervalMs ?? 500;
    this.retentionDays = opts.retentionDays ?? 8;
    this.cleanupIntervalMs = opts.cleanupIntervalMs ?? 60 * 60 * 1000;
    this.enabled = opts.enabled ?? true;
  }

  start(): void {
    if (!this.enabled) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.cleanupIntervalMs);
    // Primer cleanup al arrancar (no esperar 1h).
    void this.cleanup();
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.flush();
  }

  enqueue(op: Operacion): void {
    if (!this.enabled) return;
    if (!op.tid) return; // sin tid no podemos deduplicar; mejor no insertar.
    this.buffer.push(op);
    if (this.buffer.length >= this.flushBatchSize) {
      void this.flush();
    }
  }

  enqueueMany(ops: Operacion[]): void {
    if (!this.enabled) return;
    for (const op of ops) this.enqueue(op);
  }

  /** Drena el buffer actual a Postgres. Reentrante-safe (no se solapa con sí mismo). */
  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      // Dedupe por tid dentro del mismo batch (varias temporalidades del
      // mismo coin pueden meter el mismo trade).
      const byTid = new Map<string, Operacion>();
      for (const op of batch) {
        if (op.tid && !byTid.has(op.tid)) byTid.set(op.tid, op);
      }
      const rows = Array.from(byTid.values()).map((op) => ({
        tid: op.tid!,
        mercado: op.mercado,
        token: op.token,
        direccion: op.direccion.toLowerCase(),
        lado: op.lado,
        volumen_usd: op.volumenUsd,
        ts: op.ts,
      }));
      if (rows.length === 0) return;
      await this.sql`
        INSERT INTO lb_trades ${this.sql(rows)}
        ON CONFLICT (tid) DO NOTHING
      `;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, n: batch.length },
        'TradePersistence: flush falló (se descartan trades de este batch)',
      );
    } finally {
      this.flushing = false;
    }
  }

  /** Devuelve trades de la ventana ordenados ascendentemente por `ts`. */
  async getHistorical(
    mercado: Mercado,
    token: string,
    sinceMs: number,
    untilMs: number = Date.now(),
  ): Promise<Operacion[]> {
    if (!this.enabled) return [];
    type Row = {
      tid: string;
      mercado: string;
      token: string;
      direccion: string;
      lado: string;
      volumen_usd: number;
      ts: number;
    };
    const rows = (await this.sql<Row[]>`
      SELECT tid, mercado, token, direccion, lado, volumen_usd, ts
      FROM lb_trades
      WHERE mercado = ${mercado}
        AND token = ${token}
        AND ts >= ${sinceMs}
        AND ts <= ${untilMs}
      ORDER BY ts ASC
    `) as Row[];
    return rows.map((r) => ({
      tid: r.tid,
      mercado: r.mercado as Mercado,
      token: r.token,
      direccion: r.direccion,
      lado: r.lado as 'BUY' | 'SELL',
      volumenUsd: Number(r.volumen_usd),
      ts: Number(r.ts),
    }));
  }

  async cleanup(): Promise<void> {
    if (!this.enabled) return;
    try {
      const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
      const res = (await this.sql`
        DELETE FROM lb_trades WHERE ts < ${cutoff}
      `) as unknown as { count?: number };
      const deleted = res?.count ?? 0;
      if (deleted > 0) {
        logger.info(
          { deleted, retentionDays: this.retentionDays },
          'TradePersistence: limpieza de trades antiguos',
        );
      }
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        'TradePersistence: cleanup falló',
      );
    }
  }

  /** Diagnóstico: cuántos trades hay en BD por mercado/token (para tests). */
  async count(mercado: Mercado, token: string): Promise<number> {
    if (!this.enabled) return 0;
    const rows = (await this.sql<Array<{ c: string }>>`
      SELECT count(*) AS c FROM lb_trades WHERE mercado = ${mercado} AND token = ${token}
    `) as unknown as Array<{ c: string }>;
    return Number(rows[0]?.c ?? 0);
  }
}
