/**
 * Helpers para invocar `pgp_sym_encrypt` / `pgp_sym_decrypt` desde Drizzle.
 *
 * El cifrado simétrico de las URLs de webhook se realiza con la extensión
 * `pgcrypto` de PostgreSQL (cap. 3, modeloDeDatos.md). La clave maestra
 * (`APP_SECRET`) vive solo en el proceso, no en la BD.
 *
 * Estos helpers devuelven expresiones SQL para usarse dentro de
 * `INSERT … values({ webhookUrlEnc: encryptWebhook(...) })` o de un SELECT
 * que descifre en BD para minimizar el tiempo que la URL pasa en memoria.
 */

import { sql, type SQL } from 'drizzle-orm';
import { config } from '../config.ts';

/** Genera la expresión SQL que cifra `plain` con la clave maestra. */
export function encryptWebhook(plain: string): SQL<Uint8Array> {
  return sql<Uint8Array>`pgp_sym_encrypt(${plain}::text, ${config.APP_SECRET}::text)`;
}

/** Descifra una columna `webhook_url_enc` (BYTEA). */
export function decryptWebhookColumn<T = string>(
  columnSql: SQL,
): SQL<T> {
  return sql<T>`pgp_sym_decrypt(${columnSql}::bytea, ${config.APP_SECRET}::text)`;
}
