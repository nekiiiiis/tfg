/**
 * Worker periódico de reintentos (RS-07).
 *
 * Cada `NOTIFICATION_RETRY_TICK_SECONDS` recorre las notificaciones con
 * `estado = 'PENDIENTE'` y `proximoIntento <= now()`, y las pasa al
 * `NotificacionService` para intentar la transmisión.
 *
 * Sustituye a la cola Redis del cap. 3: la cola virtual vive en la propia tabla
 * `notificaciones`, ordenada por `proximoIntento`.
 */

import { and, asc, eq, lte } from 'drizzle-orm';
import type { DB } from '../../persistence/db.ts';
import { notificaciones } from '../../persistence/schema/notificaciones.ts';
import { config } from '../../config.ts';
import { logger } from '../../shared/logger.ts';
import type { NotificacionService } from './notificacion.service.ts';

const BATCH_SIZE = 25;

export function startRetryWorker(
  db: DB,
  service: NotificacionService,
): () => void {
  const tickMs = config.NOTIFICATION_RETRY_TICK_SECONDS * 1000;
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const due = await db
        .select({ id: notificaciones.id })
        .from(notificaciones)
        .where(
          and(
            eq(notificaciones.estado, 'PENDIENTE'),
            lte(notificaciones.proximoIntento, new Date()),
          ),
        )
        .orderBy(asc(notificaciones.proximoIntento))
        .limit(BATCH_SIZE);
      for (const row of due) {
        await service
          .transmitirYActualizar(row.id)
          .catch((err) =>
            logger.warn({ err: (err as Error).message, id: row.id }, 'retry transmit failed'),
          );
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'retry worker tick failed');
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, tickMs);
  interval.unref();
  // Primer tick rápido tras arrancar para procesar pendientes acumulados.
  setTimeout(tick, 1000).unref?.();

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
