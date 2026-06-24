/**
 * Tipos del dominio.
 *
 * Materializan los conceptos del Modelo del Dominio (cap. 2):
 * Mercado, Token, Direccion, Operacion, Precio, AlertaPrecio, Webhook,
 * Notificacion y los estados asociados.
 *
 * Esta capa es pura: no importa nada fuera de sí misma.
 */

export type Address = string; // "0x" + 40 hex (validado en el borde)
/**
 * Identificador de token *visible al usuario*. Convención por mercado:
 *   - PerpNativo: símbolo del coin perp ("BTC", "HYPE", …).
 *   - Spot:       par "<base>/<quote>" ("HYPE/USDC", "HYPE/USDT", …).
 *   - PerpHIP3:   "<dex>:<symbol>" ("xyz:SP500", …) — formato canónico de HL.
 *
 * El MetaService traduce esto al identificador interno de Hyperliquid
 * (`@<idx>` para spot, símbolo desnudo para perp nativo, `<dex>:<sym>` para HIP-3).
 */
export type TokenSymbol = string;

export const MERCADOS = ['Spot', 'PerpNativo', 'PerpHIP3'] as const;
export type Mercado = (typeof MERCADOS)[number];

export const TEMPORALIDADES = ['1h', '4h', '6h', '12h', '1d', '1w'] as const;
export type Temporalidad = (typeof TEMPORALIDADES)[number];

export const LADOS = ['ALL', 'BUY', 'SELL'] as const;
export type Lado = (typeof LADOS)[number];

export interface Terna {
  mercado: Mercado;
  token: TokenSymbol;
  temporalidad: Temporalidad;
}

export interface Operacion {
  token: TokenSymbol;
  mercado: Mercado;
  direccion: Address;
  /**
   * Volumen en USD (positivo).
   * El signo lo aporta `lado`: BUY suma a volumenCompra, SELL a volumenVenta.
   */
  volumenUsd: number;
  lado: 'BUY' | 'SELL';
  /** Instante de la operación en epoch milliseconds. */
  ts: number;
  /** Identificador único del trade (hash de Hyperliquid). Para deduplicar WS↔REST. */
  tid?: string;
}

export interface Precio {
  token: TokenSymbol;
  valor: number; // USD
  ts: number; // epoch ms
}

export const ESTADOS_ALERTA = [
  'OPERATIVA',
  'DISPARADA',
  'NOTIFICACION_FALLIDA',
] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

export const CRUCES = ['SUBE', 'BAJA'] as const;
export type Cruce = (typeof CRUCES)[number];

export interface Umbral {
  cruce: Cruce;
  valor: number; // > 0
}

/**
 * Evalúa si un precio dispara una alerta dado su umbral.
 * Regla:
 *   - SUBE: dispara cuando precio.valor >= umbral.valor.
 *   - BAJA: dispara cuando precio.valor <= umbral.valor.
 */
export function evaluarUmbral(umbral: Umbral, precio: Precio): boolean {
  if (umbral.cruce === 'SUBE') return precio.valor >= umbral.valor;
  return precio.valor <= umbral.valor;
}

export const ESTADOS_ENTREGA = ['PENDIENTE', 'ENTREGADA', 'FALLIDA'] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

/** Validadores básicos del borde (vienen aquí porque el formato es del dominio). */

const ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
export function esAddressValida(s: string): boolean {
  return ADDRESS_RE.test(s);
}

/**
 * Acepta los tres formatos canónicos:
 *   - "BTC"           (perp nativo)
 *   - "HYPE/USDC"     (spot, base/quote)
 *   - "xyz:SP500"     (HIP-3, dex:symbol)
 *   - "@107"          (id interno de spot, por compatibilidad — se aceptan
 *                      mensajes que llegan ya resueltos del feed)
 */
const TOKEN_RE = /^(?:@\d{1,8}|[A-Za-z0-9_.-]{1,32}(?::[A-Za-z0-9_.-]{1,32})?(?:\/[A-Za-z0-9_.-]{1,32})?)$/;
export function esTokenValido(s: string): boolean {
  return TOKEN_RE.test(s) && s.length <= 64;
}

/** Temporalidad → segundos (consultado en el config externo). */
export const TEMPORALIDAD_DEFAULT_SECONDS: Record<Temporalidad, number> = {
  '1h': 3600,
  '4h': 14_400,
  '6h': 21_600,
  '12h': 43_200,
  '1d': 86_400,
  '1w': 604_800,
};
