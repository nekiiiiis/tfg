/**
 * Tabla `alertas`. Soporta CU-09..CU-13.
 *
 * El campo `webhookUrlEnc` es BYTEA cifrado simétricamente con
 * `pgp_sym_encrypt` (extensión `pgcrypto`) usando `APP_SECRET` como clave
 * maestra. La aplicación nunca lo serializa de vuelta al cliente — RS-10.
 */

import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const estadoAlertaEnum = pgEnum('estado_alerta', [
  'OPERATIVA',
  'DISPARADA',
  'NOTIFICACION_FALLIDA',
]);
export const cruceEnum = pgEnum('cruce', ['SUBE', 'BAJA']);
export const mercadoCheckValues = ['Spot', 'PerpNativo', 'PerpHIP3'] as const;

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(v) {
    return Buffer.from(v);
  },
  fromDriver(v: unknown) {
    if (v instanceof Uint8Array) return v;
    if (typeof v === 'string') {
      // postgres-js puede devolverlo en hex o escape; aceptamos ambos.
      if (v.startsWith('\\x')) return new Uint8Array(Buffer.from(v.slice(2), 'hex'));
      return new Uint8Array(Buffer.from(v));
    }
    return new Uint8Array(v as ArrayBufferLike);
  },
});

export const alertas = pgTable(
  'alertas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tokenSimbolo: varchar('token_simbolo', { length: 16 }).notNull(),
    mercado: varchar('mercado', { length: 16 }).notNull(),
    umbralValor: numeric('umbral_valor', { precision: 28, scale: 8 }).notNull(),
    umbralCruce: cruceEnum('umbral_cruce').notNull(),
    webhookUrlEnc: bytea('webhook_url_enc').notNull(),
    estado: estadoAlertaEnum('estado').notNull().default('OPERATIVA'),
    creadaEn: timestamp('creada_en', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    ultimoDisparo: timestamp('ultimo_disparo', { withTimezone: true }),
    ultimoIntento: timestamp('ultimo_intento', { withTimezone: true }),
  },
  (t) => ({
    porTokenEstado: index('alertas_token_estado').on(t.tokenSimbolo, t.estado),
  }),
);

export type Alerta = typeof alertas.$inferSelect;
export type NuevaAlerta = typeof alertas.$inferInsert;
