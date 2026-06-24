/**
 * DTOs enriquecidos que sirve `AddressDetailService` al frontend.
 *
 * La diferencia con los tipos del puerto (`hyperliquid.port.ts`) es que aquí
 * los tokens ya vienen mapeados al "display token" (`HYPE.p`, `HYPE/USDC`,
 * `xyz:SP500`) y, cuando se puede, enriquecidos con precio actual y valor
 * en USD. El front solo tiene que renderizar.
 */

import type { Mercado } from '../../domain/types.ts';

/**
 * Saldo spot de un activo base. Hyperliquid devuelve los balances por
 * *token base* (no por par), así que el "id" aquí es el símbolo del activo
 * (USDC, HYPE, PURR, …).
 */
export interface SpotBalanceDTO {
  /** Símbolo del activo (USDC, HYPE, PURR, …). */
  id: string;
  /** Etiqueta legible (suele coincidir con `id`). */
  label: string;
  total: number;
  /** Bloqueado (en órdenes abiertas, etc.). */
  hold: number;
  /** `total - hold`, comodidad para la UI. */
  available: number;
  /** Notional de entrada (lo que costó adquirirlo). */
  entryNtl?: number;
  /** Precio actual estimado contra USDC (usando `allMids`). */
  markPxUsdc?: number;
  /** Valor en USD aproximado: `total * markPxUsdc` (si hay precio). */
  valueUsd?: number;
}

export interface SpotSummaryDTO {
  /** Balances regulares en spot. */
  balances: SpotBalanceDTO[];
  /** Valor total en USD (suma de `valueUsd` cuando hay precio). */
  totalValueUsd: number;
  /** Saldo en USDC, útil para destacarlo en cabecera. */
  usdcDisponible: number;
}

export interface PerpPositionDTO {
  /** ID mostrado (BTC.p, ETH.p, xyz:SP500). */
  id: string;
  label: string;
  /** PerpNativo | PerpHIP3. */
  mercado: Mercado;
  side: 'LONG' | 'SHORT';
  size: number;
  sizeAbs: number;
  entryPx: number;
  markPx?: number;
  liquidationPx?: number;
  /** Distancia al precio de liquidación, %, frente a markPx (positivo = aún margen). */
  liquidationDistancePct?: number;
  positionValue: number;
  unrealizedPnl: number;
  /** PnL expresado en % sobre margen usado (return on equity). */
  roiPct?: number;
  leverage: number;
  leverageType?: 'cross' | 'isolated' | string;
  maxLeverage?: number;
  marginUsed?: number;
  cumFundingSinceOpen?: number;
  cumFundingAllTime?: number;
}

export interface PerpSummaryDTO {
  posiciones: PerpPositionDTO[];
  accountValue: number;
  marginUsed: number;
  /** Notional total de las posiciones abiertas. */
  totalNtlPos: number;
  totalRawUsd: number;
  /** Disponible para retirar a spot. */
  withdrawable: number;
  crossMaintenanceMarginUsed?: number;
  /** Sumatorio rápido de `unrealizedPnl` para la cabecera. */
  unrealizedPnlTotal: number;
}

export interface StakingDelegationDTO {
  validator: string;
  amount: number;
  lockedUntilTimestamp: number;
}

export interface StakingSummaryDTO {
  /** HYPE en staking (delegado). */
  delegated: number;
  /** HYPE retirado a la cuenta de staking pero no delegado. */
  undelegated: number;
  totalPendingWithdrawal: number;
  nPendingWithdrawals: number;
  /** HYPE total en la "subcuenta" de staking (delegated + undelegated). */
  stakingBalance: number;
  delegations: StakingDelegationDTO[];
}

export interface FillDTO {
  /** ID mostrado (BTC.p, HYPE/USDC, xyz:SP500); si no hay mapping → coin crudo. */
  id: string;
  label: string;
  /** Mercado al que pertenece (cuando se puede resolver). */
  mercado?: Mercado;
  side: 'BUY' | 'SELL';
  px: number;
  sz: number;
  /** Notional (px*sz). */
  notional: number;
  time: number;
  hash?: string;
  fee?: number;
  closedPnl?: number;
  dir?: string;
}
