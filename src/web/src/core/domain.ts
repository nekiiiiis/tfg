/**
 * Lógica de dominio compartida del frontend: etiquetas, agrupación de tokens,
 * resolución de precios y parámetros de gráficos. Una sola fuente de verdad
 * para que leaderboard, alertas y ticker muestren lo mismo.
 */

import type { ComboboxGroup } from '@/components/ui/combobox';
import type {
  Mercado,
  MetaToken,
  Temporalidad,
  TopVolumeToken,
} from './api';

/** Lado visible en el leaderboard (sin modo combinado). */
export type LeaderboardLado = 'BUY' | 'SELL';

export const LEADERBOARD_LADOS: LeaderboardLado[] = ['BUY', 'SELL'];

/**
 * Token por defecto al cambiar de mercado. Si no existe en catálogo, se
 * cae al primer token disponible (ver `defaultTokenFor` en AppDataContext).
 */
export const DEFAULT_TOKEN_BY_MERCADO: Record<Mercado, string> = {
  PerpNativo: 'BTC.p',
  Spot: 'HYPE/USDC',
  PerpHIP3: 'xyz:SP500',
};

export const MERCADO_LABEL: Record<Mercado, string> = {
  Spot: 'Spot',
  PerpNativo: 'Perps',
  PerpHIP3: 'HIP3',
};

export const LADO_LABEL: Record<LeaderboardLado, string> = {
  BUY: 'Top compradores',
  SELL: 'Top vendedores',
};

export const LADO_SHORT: Record<LeaderboardLado, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
};

/** Intervalos soportados por Hyperliquid candleSnapshot. */
export type HlChartInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w';

/**
 * Mapeo temporalidad del leaderboard → velas del gráfico.
 * lookback en segundos para que el chart muestre suficiente historia.
 */
export const TEMPORALIDAD_CHART: Record<
  Temporalidad,
  { interval: HlChartInterval; lookbackSec: number }
> = {
  '1h': { interval: '1m', lookbackSec: 3 * 3600 },
  '4h': { interval: '5m', lookbackSec: 24 * 3600 },
  '6h': { interval: '5m', lookbackSec: 24 * 3600 },
  '12h': { interval: '15m', lookbackSec: 3 * 86_400 },
  '1d': { interval: '1h', lookbackSec: 7 * 86_400 },
  '1w': { interval: '4h', lookbackSec: 30 * 86_400 },
};

/** Volumen relevante según el lado seleccionado. */
export function volumenPorLado(
  fila: { volumenCompra: number; volumenVenta: number },
  lado: LeaderboardLado,
): number {
  return lado === 'BUY' ? fila.volumenCompra : fila.volumenVenta;
}

/**
 * Precio mid para un token display. `mids` usa claves display (post-traducción
 * del WS). Si no hay entrada directa, intenta por `midsKey` del catálogo.
 */
export function resolveMidPrice(
  mids: Record<string, number>,
  tokenId: string,
  catalog?: MetaToken | null,
): number | undefined {
  const direct = mids[tokenId];
  if (typeof direct === 'number') return direct;
  if (catalog) {
    const byKey = mids[catalog.midsKey];
    if (typeof byKey === 'number') return byKey;
    const byFeed = mids[catalog.feedCoin];
    if (typeof byFeed === 'number') return byFeed;
  }
  return undefined;
}

/** Agrupa tokens del catálogo para el combobox (misma lógica en toda la app). */
export function groupMetaTokens(
  mercado: Mercado,
  items: MetaToken[],
): ComboboxGroup[] {
  if (mercado === 'Spot') {
    const m = new Map<string, MetaToken[]>();
    for (const t of items) {
      const k = t.quote ?? 'OTROS';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([grupo, list]) => ({
        label: `Pares ${grupo}`,
        items: list
          .sort((a, b) => a.base.localeCompare(b.base))
          .map((t) => ({
            value: t.id,
            label: t.label,
            searchText: `${t.base} ${t.quote ?? ''}`,
          })),
      }));
  }
  if (mercado === 'PerpHIP3') {
    const m = new Map<string, MetaToken[]>();
    for (const t of items) {
      const k = t.dex ?? 'sin-dex';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dex, list]) => ({
        label: `Dex ${dex}`,
        items: list
          .sort((a, b) => a.base.localeCompare(b.base))
          .map((t) => ({
            value: t.id,
            label: t.label,
            searchText: `${t.base} ${t.dex ?? ''}`,
          })),
      }));
  }
  return [
    {
      label: '',
      items: items
        .sort((a, b) => a.base.localeCompare(b.base))
        .map((t) => ({
          value: t.id,
          label: t.label,
          searchText: t.base,
        })),
    },
  ];
}

/** Orden del ticker: destacados primero, luego top volumen, luego resto de mids. */
export function buildTickerOrder(
  mids: Record<string, number>,
  top: TopVolumeToken[] | undefined,
  highlights: string[],
  limit: number,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const h of highlights) {
    if (typeof mids[h] === 'number' && !seen.has(h)) {
      ordered.push(h);
      seen.add(h);
    }
  }
  for (const t of top ?? []) {
    if (seen.has(t.id)) continue;
    if (typeof mids[t.id] === 'number') {
      ordered.push(t.id);
      seen.add(t.id);
      if (ordered.length >= limit) return ordered;
    }
  }
  for (const token of Object.keys(mids)) {
    if (seen.has(token)) continue;
    ordered.push(token);
    seen.add(token);
    if (ordered.length >= limit) break;
  }
  return ordered;
}
