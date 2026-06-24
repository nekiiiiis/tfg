/**
 * Servicio de notificación (CU-14).
 *
 * Flujo:
 *  1. Cuando se dispara una alerta, `Evaluador` invoca `dispararParaAlerta`.
 *  2. Se persiste la `Notificacion` en estado `PENDIENTE` (RS-09 — trazabilidad).
 *  3. Se intenta la transmisión vía `WebhookConnector`.
 *  4. Si responde 2xx: se marca `ENTREGADA`, se emite `NotificacionConfirmada`
 *     y la alerta se "rearma" a `OPERATIVA`.
 *  5. Si falla: se reprograma el `proximoIntento` según el backoff de
 *     `NOTIFICATION_RETRY_BACKOFF_SECONDS` y se emite `NotificacionFallida`.
 *     Tras agotar los intentos, la alerta queda `NOTIFICACION_FALLIDA`.
 */

import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DB } from '../../persistence/db.ts';
import {
  alertas as alertasTable,
  type Alerta,
} from '../../persistence/schema/alertas.ts';
import {
  notificaciones as notificacionesTable,
  type Notificacion,
} from '../../persistence/schema/notificaciones.ts';
import { config } from '../../config.ts';
import { bus } from '../../bus.ts';
import { logger } from '../../shared/logger.ts';
import type {
  AlertaWebhookPayload,
  WebhookConnector,
} from './webhook.connector.ts';

export interface DispararInput {
  alertaId: string;
  precio: number;
}

export class NotificacionService {
  constructor(
    private readonly db: DB,
    private readonly webhook: WebhookConnector,
  ) {}

  /**
   * Dispara la notificación para una alerta recién evaluada como `DISPARADA`.
   * Crea la fila `notificaciones` y lanza la transmisión en background.
   */
  async dispararParaAlerta(input: DispararInput): Promise<Notificacion> {
    const [created] = await this.db
      .insert(notificacionesTable)
      .values({
        alertaId: input.alertaId,
        precioDisparador: input.precio.toString(),
        estado: 'PENDIENTE',
        intento: 1,
        proximoIntento: new Date(),
      })
      .returning();
    if (!created) throw new Error('No se pudo crear la notificación');

    // Lanzamos la transmisión sin esperar (background). Si el worker periódico
    // detecta `PENDIENTE` con `proximoIntento <= now`, también la procesará.
    this.transmitirYActualizar(created.id).catch((err) =>
      logger.warn({ err: (err as Error).message, id: created.id }, 'transmitir background error'),
    );
    return created;
  }

  /** Procesa una notificación pendiente (usado por el worker y por el flujo eager). */
  async transmitirYActualizar(notificacionId: string): Promise<void> {
    const { alerta, notif, urlClara } = await this.cargarConUrl(notificacionId);
    if (notif.estado !== 'PENDIENTE') return;

    const payload: AlertaWebhookPayload = {
      alertaId: alerta.id,
      notificacionId: notif.id,
      token: alerta.tokenSimbolo,
      mercado: alerta.mercado,
      umbral: {
        cruce: alerta.umbralCruce,
        valor: Number(alerta.umbralValor),
      },
      precioDisparador: Number(notif.precioDisparador),
      intento: notif.intento,
      instanteEmision: (notif.instanteEmision instanceof Date
        ? notif.instanteEmision
        : new Date(notif.instanteEmision as string)
      ).toISOString(),
    };
    const result = await this.webhook.transmitAlerta(urlClara, payload);

    if (result.ok) {
      await this.db
        .update(notificacionesTable)
        .set({ estado: 'ENTREGADA', entregadaEn: new Date() })
        .where(eq(notificacionesTable.id, notif.id));
      await this.db
        .update(alertasTable)
        .set({ estado: 'OPERATIVA', ultimoIntento: new Date() })
        .where(eq(alertasTable.id, alerta.id));
      bus.emit('NotificacionConfirmada', {
        name: 'NotificacionConfirmada',
        ocurridoEn: Date.now(),
        notificacionId: notif.id,
        alertaId: alerta.id,
      });
      return;
    }

    // ---- fallo ----
    const motivo =
      result.error ?? `HTTP ${result.status}${result.bodySnippet ? `: ${result.bodySnippet}` : ''}`;
    const backoff = config.NOTIFICATION_RETRY_BACKOFF_SECONDS;
    const proximoIdx = notif.intento - 1; // tras este intento, el (intento+1) usará backoff[proximoIdx]
    const finalIntento = notif.intento >= backoff.length;

    logger.warn(
      {
        notificacionId: notif.id,
        alertaId: alerta.id,
        token: alerta.tokenSimbolo,
        intento: notif.intento,
        maxIntentos: backoff.length,
        ultimoIntento: finalIntento,
        status: result.status,
        bodySnippet: result.bodySnippet,
        error: result.error,
        motivo,
      },
      finalIntento
        ? 'Webhook agotó reintentos: alerta queda NOTIFICACION_FALLIDA'
        : 'Webhook falló, se reintentará',
    );

    if (finalIntento) {
      await this.db
        .update(notificacionesTable)
        .set({
          estado: 'FALLIDA',
          ultimoError: motivo,
        })
        .where(eq(notificacionesTable.id, notif.id));
      await this.db
        .update(alertasTable)
        .set({
          estado: 'NOTIFICACION_FALLIDA',
          ultimoIntento: new Date(),
        })
        .where(eq(alertasTable.id, alerta.id));
    } else {
      const delaySec = backoff[proximoIdx + 1] ?? backoff[backoff.length - 1]!;
      await this.db
        .update(notificacionesTable)
        .set({
          intento: notif.intento + 1,
          proximoIntento: new Date(Date.now() + delaySec * 1000),
          ultimoError: motivo,
        })
        .where(eq(notificacionesTable.id, notif.id));
      await this.db
        .update(alertasTable)
        .set({
          estado: 'NOTIFICACION_FALLIDA',
          ultimoIntento: new Date(),
        })
        .where(eq(alertasTable.id, alerta.id));
    }
    bus.emit('NotificacionFallida', {
      name: 'NotificacionFallida',
      ocurridoEn: Date.now(),
      notificacionId: notif.id,
      alertaId: alerta.id,
      motivo,
    });
  }

  /** Carga la notificación + alerta + URL descifrada en una sola consulta. */
  private async cargarConUrl(notificacionId: string): Promise<{
    notif: Notificacion;
    alerta: Alerta;
    urlClara: string;
  }> {
    const rows = await this.db.execute<{
      n_id: string;
      n_alerta_id: string;
      n_precio: string;
      n_emision: Date;
      n_estado: 'PENDIENTE' | 'ENTREGADA' | 'FALLIDA';
      n_intento: number;
      n_proximo: Date;
      n_ult_err: string | null;
      n_entregada: Date | null;
      a_id: string;
      a_token: string;
      a_mercado: string;
      a_umbral: string;
      a_cruce: 'SUBE' | 'BAJA';
      a_estado: 'OPERATIVA' | 'DISPARADA' | 'NOTIFICACION_FALLIDA';
      a_creada: Date;
      a_ult_disparo: Date | null;
      a_ult_intento: Date | null;
      url_clara: string;
    }>(sql`
      SELECT
        n.id            AS n_id,
        n.alerta_id     AS n_alerta_id,
        n.precio_disparador AS n_precio,
        n.instante_emision AS n_emision,
        n.estado        AS n_estado,
        n.intento       AS n_intento,
        n.proximo_intento AS n_proximo,
        n.ultimo_error  AS n_ult_err,
        n.entregada_en  AS n_entregada,
        a.id            AS a_id,
        a.token_simbolo AS a_token,
        a.mercado       AS a_mercado,
        a.umbral_valor  AS a_umbral,
        a.umbral_cruce  AS a_cruce,
        a.estado        AS a_estado,
        a.creada_en     AS a_creada,
        a.ultimo_disparo AS a_ult_disparo,
        a.ultimo_intento AS a_ult_intento,
        pgp_sym_decrypt(a.webhook_url_enc::bytea, ${config.APP_SECRET}::text) AS url_clara
      FROM notificaciones n
      JOIN alertas a ON a.id = n.alerta_id
      WHERE n.id = ${notificacionId}
      LIMIT 1
    `);
    const r = rows[0];
    if (!r) throw new Error(`Notificación ${notificacionId} no existe`);
    return {
      notif: {
        id: r.n_id,
        alertaId: r.n_alerta_id,
        precioDisparador: r.n_precio,
        instanteEmision: r.n_emision,
        estado: r.n_estado,
        intento: r.n_intento,
        proximoIntento: r.n_proximo,
        ultimoError: r.n_ult_err,
        entregadaEn: r.n_entregada,
      },
      alerta: {
        id: r.a_id,
        tokenSimbolo: r.a_token,
        mercado: r.a_mercado,
        umbralValor: r.a_umbral,
        umbralCruce: r.a_cruce,
        webhookUrlEnc: new Uint8Array(),
        estado: r.a_estado,
        creadaEn: r.a_creada,
        ultimoDisparo: r.a_ult_disparo,
        ultimoIntento: r.a_ult_intento,
      },
      urlClara: r.url_clara,
    };
  }
}
