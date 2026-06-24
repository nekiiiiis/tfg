/**
 * Cliente HTTP minimalista. Devuelve JSON tipado; lanza si la respuesta no es
 * 2xx, intentando incluir el `error.message` que el backend formatea de manera
 * uniforme en `attachErrorHandler`.
 */

export type ApiError = {
  code: string;
  message: string;
  status: number;
};

const BASE = ''; // mismo origen (Vite proxy a /api)

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const e =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? (parsed as { error: { code?: string; message?: string } }).error
        : null;
    const err: ApiError = {
      code: e?.code ?? 'HTTP_ERROR',
      message: e?.message ?? `HTTP ${res.status}`,
      status: res.status,
    };
    throw err;
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ---- Tipos compartidos con el backend ----

export const MERCADOS = ['Spot', 'PerpNativo', 'PerpHIP3'] as const;
export type Mercado = (typeof MERCADOS)[number];
export const TEMPORALIDADES = ['1h', '4h', '6h', '12h', '1d', '1w'] as const;
export type Temporalidad = (typeof TEMPORALIDADES)[number];
export const LADOS = ['ALL', 'BUY', 'SELL'] as const;
export type Lado = (typeof LADOS)[number];
export const CRUCES = ['SUBE', 'BAJA'] as const;
export type Cruce = (typeof CRUCES)[number];
export const ESTADOS_ALERTA = [
  'OPERATIVA',
  'DISPARADA',
  'NOTIFICACION_FALLIDA',
] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

export interface MetaToken {
  mercado: Mercado;
  /** Identificador "display": "BTC", "HYPE/USDC", "xyz:SP500". */
  id: string;
  label: string;
  base: string;
  quote?: string;
  dex?: string;
  feedCoin: string;
  /** Clave en el snapshot `allMids` de Hyperliquid. */
  midsKey: string;
  szDecimals?: number;
}

export interface MetaTokensResponse {
  generadoEn: number;
  total: number;
  tokens: MetaToken[];
}

export interface TopVolumeToken {
  mercado: Mercado;
  id: string;
  label: string;
  midsKey: string;
  dayNtlVlm: number;
  markPx: number;
}

export interface TopVolumeResponse {
  generadoEn: number;
  total: number;
  tokens: TopVolumeToken[];
}

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlesResponse {
  generadoEn: number;
  mercado: Mercado;
  token: string;
  feedCoin: string;
  interval: string;
  velas: CandleBar[];
}

export interface FilaLeaderboard {
  direccion: string;
  volumenCompra: number;
  volumenVenta: number;
  /** Calculado en el cliente. */
  volumenTotal?: number;
  nombreEntidad?: string;
}

export interface LeaderboardBalance {
  direccion: string;
  usdAvailable: number | null;
  tokenAvailable: number | null;
  tokenSymbol: string;
}

export interface LeaderboardBalancesResponse {
  mercado: Mercado;
  token: string;
  tokenSymbol: string;
  saldos: LeaderboardBalance[];
}

export interface Entidad {
  id: string;
  nombre: string;
  creadaEn: string;
  actualizada: string;
  numDirecciones: number;
}

export interface Direccion {
  id: string;
  valor: string;
  entidadId: string;
  aniadidaEn: string;
}

export interface AlertaResumen {
  id: string;
  token: string;
  mercado: Mercado;
  umbralValor: number;
  umbralCruce: Cruce;
  estado: EstadoAlerta;
  creadaEn: string;
  ultimoDisparo: string | null;
  ultimoIntento: string | null;
  webhookHost: string;
}
