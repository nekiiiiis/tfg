/**
 * Tabla `notificaciones`. Soporta CU-13/CU-14 y la trazabilidad RS-09.
 *
 * El campo `proximoIntento` permite implementar la cola de reintentos sin
 * Redis: un `RetryWorker` periódico recoge las filas con estado `PENDIENTE` y
 * `proximo_intento <= now()` y reintenta la entrega.
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { alertas } from './alertas.ts';

export const estadoEntregaEnum = pgEnum('estado_entrega', [
  'PENDIENTE',
  'ENTREGADA',
  'FALLIDA',
]);

export const notificaciones = pgTable(
  'notificaciones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    alertaId: uuid('alerta_id')
      .notNull()
      .references(() => alertas.id, { onDelete: 'cascade' }),
    precioDisparador: numeric('precio_disparador', {
      precision: 28,
      scale: 8,
    }).notNull(),
    instanteEmision: timestamp('instante_emision', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    estado: estadoEntregaEnum('estado').notNull().default('PENDIENTE'),
    intento: integer('intento').notNull().default(1),
    proximoIntento: timestamp('proximo_intento', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ultimoError: text('ultimo_error'),
    entregadaEn: timestamp('entregada_en', { withTimezone: true }),
  },
  (t) => ({
    porAlerta: index('notif_alerta').on(t.alertaId, t.instanteEmision),
    pendientesPorVencimiento: index('notif_pendientes_proximas').on(
      t.estado,
      t.proximoIntento,
    ),
  }),
);

export type Notificacion = typeof notificaciones.$inferSelect;
export type NuevaNotificacion = typeof notificaciones.$inferInsert;
