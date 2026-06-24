/**
 * Formateadores compartidos.
 */

const fmtUsdInt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fmtUsd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const fmtUsd6 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
});
const fmtNum = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

export const formatUsd = (n: number): string => fmtUsdInt.format(n);
export const formatUsdFine = (n: number): string =>
  Math.abs(n) >= 1 ? fmtUsd2.format(n) : fmtUsd6.format(n);
export const formatNumber = (n: number): string => fmtNum.format(n);

/** USD con signo explícito (+/-) para columnas de PnL, fondos, etc. */
export function formatSignedUsd(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  return sign + (abs >= 1 ? fmtUsd2.format(abs) : fmtUsd6.format(abs));
}

/** Porcentaje con un decimal y signo explícito. */
export function formatPct(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals)}%`;
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Cantidad de tokens en notación corta (1.2K, 34.5M, …). Sin símbolo, el
 * caller decide si añade `HYPE`, `BTC`, etc.
 */
export function formatTokenAmount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

/** USD compacto: $1.2K, $34.5M, $1.20B. */
export function formatUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return formatUsdFine(n);
}

export function relativeTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  if (diff < 1000) return 'ahora';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(tsMs).toLocaleString();
}
