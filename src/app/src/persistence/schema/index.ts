/**
 * Punto único de exportación del esquema Drizzle.
 *
 * Cada tabla vive en su propio fichero (entidades, direcciones, alertas,
 * notificaciones) y se re-exporta aquí para que `drizzle(sql, { schema })`
 * reciba todo el mapeo en un único objeto.
 */

export * from './entidades.ts';
export * from './direcciones.ts';
export * from './alertas.ts';
export * from './notificaciones.ts';
export * from './lb_trades.ts';
