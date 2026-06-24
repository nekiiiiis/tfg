/**
 * Suscripción al bus para realizar CU-13.
 *
 * Se conecta a `PrecioActualizado`: recupera las alertas operativas para el
 * token, aplica el predicado y, para cada disparada:
 *   - actualiza el estado en BD.
 *   - emite `AlertaDisparada`.
 *   - solicita a `NotificacionService` que dispare la notificación (CU-14).
 *
 * No conoce HTTP ni WebSocket — es código de aplicación puro.
 */

import { and, eq } from 'drizzle-orm';
import { bus } from '../../bus.ts';
import { logger } from '../../shared/logger.ts';
import type { DB } from '../../persistence/db.ts';
import { alertas } from '../../persistence/schema/alertas.ts';
import {
  evaluarAlertasContraPrecio,
  type AlertaEvaluable,
} from './evaluator.ts';
import type { NotificacionService } from '../notificacion/notificacion.service.ts';

export function wireEvaluacion(
  db: DB,
  notificaciones: NotificacionService,
): () => void {
  return bus.on('PrecioActualizado', async (event) => {
    const { token, valor } = event.precio;
    const rows = await db
      .select({
        id: alertas.id,
        umbralValor: alertas.umbralValor,
        umbralCruce: alertas.umbralCruce,
      })
      .from(alertas)
      .where(and(eq(alertas.tokenSimbolo, token), eq(alertas.estado, 'OPERATIVA')));

    if (rows.length === 0) return;
    const evaluables: AlertaEvaluable[] = rows.map((r) => ({
      id: r.id,
      umbral: {
        cruce: r.umbralCruce as 'SUBE' | 'BAJA',
        valor: Number(r.umbralValor),
      },
    }));
    const disparadas = evaluarAlertasContraPrecio(evaluables, event.precio);
    if (disparadas.length === 0) return;

    logger.info({ token, valor, count: disparadas.length }, 'Alertas disparadas');
    for (const id of disparadas) {
      // Transacción mínima: cambio de estado + creación de notificación.
      await db.transaction(async (tx) => {
        await tx
          .update(alertas)
          .set({ estado: 'DISPARADA', ultimoDisparo: new Date() })
          .where(eq(alertas.id, id));
      });
      bus.emit('AlertaDisparada', {
        name: 'AlertaDisparada',
        ocurridoEn: Date.now(),
        alertaId: id,
        token,
        precioDisparador: valor,
      });
      await notificaciones
        .dispararParaAlerta({ alertaId: id, precio: valor })
        .catch((err) =>
          logger.warn(
            { err: (err as Error).message, id },
            'Fallo al lanzar notificación',
          ),
        );
    }
  });
}
