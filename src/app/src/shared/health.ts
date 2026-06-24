/**
 * Endpoint de salud. Devuelve 200 si todos los componentes críticos están OK
 * y 503 en caso contrario. El cuerpo incluye el estado por componente para
 * diagnóstico.
 *
 *  - `db`: ping a Postgres (`select 1`).
 *  - `source`: tiempo desde el último mensaje del feed; si supera el umbral
 *    configurado, marca `degraded` (no `down`) — el sistema sigue sirviendo
 *    REST y el último snapshot.
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import type { IHyperliquidSource } from '../sources/hyperliquid.port.ts';
import type postgres from 'postgres';

interface HealthDeps {
  source: IHyperliquidSource;
  sql: postgres.Sql;
}

export function registerHealth(
  fastify: FastifyInstance,
  deps: HealthDeps,
): void {
  fastify.get('/health', async (_req, reply) => {
    const now = Date.now();
    const checks: Record<string, { status: string; detail?: unknown }> = {};

    // DB
    try {
      await deps.sql`select 1`;
      checks['db'] = { status: 'up' };
    } catch (err) {
      checks['db'] = { status: 'down', detail: (err as Error).message };
    }

    // Source
    const lastAt = deps.source.lastMessageAt();
    if (lastAt === null) {
      checks['source'] = { status: 'pending', detail: { name: deps.source.name } };
    } else {
      const ageSec = (now - lastAt) / 1000;
      const stale = ageSec > config.HYPERLIQUID_FEED_STALE_SECONDS;
      checks['source'] = {
        status: stale ? 'degraded' : 'up',
        detail: { name: deps.source.name, ageSec },
      };
    }

    const anyDown = Object.values(checks).some((c) => c.status === 'down');
    const httpStatus = anyDown ? 503 : 200;

    return reply.status(httpStatus).send({
      status: anyDown ? 'down' : 'up',
      checks,
      now,
    });
  });
}
