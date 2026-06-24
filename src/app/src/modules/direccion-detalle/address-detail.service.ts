/**
 * Servicio de detalle global de dirección.
 *
 * Extensión funcional de CU-07: dada una dirección, expone saldos spot,
 * estado perp (clearinghouse), staking y últimas operaciones (fills).
 * Todos los datos vienen de la fuente Hyperliquid a través del puerto
 * `IHyperliquidSource`, garantizando la sustituibilidad RS-08 también para
 * las consultas puntuales.
 *
 * A diferencia del adaptador, este servicio:
 *   - Mapea los tokens crudos al "display token" usando `MetaService`
 *     (`BTC` → `BTC.p`, `dex:SP500` → `dex:SP500` como ya viene).
 *   - Enriquece los balances spot con precio mark (vía `getMidsKey`) y
 *     valor en USD aproximado.
 *   - Calcula campos derivados que ya espera el front (side, sizeAbs,
 *     liquidationDistancePct, roiPct, stakingBalance, available, …).
 *
 * Esto permite que la página de detalle reciba datos coherentes con el
 * resto de la aplicación y no símbolos crudos como `@107`.
 */

import type { Address, Mercado, TokenSymbol } from '../../domain/types.ts';
import type { IHyperliquidSource } from '../../sources/hyperliquid.port.ts';
import type { MetaService, TokenInfo } from '../meta/meta.service.ts';
import { esAddressValida } from '../../domain/types.ts';
import { DireccionInvalida } from '../../domain/errors.ts';
import type {
  FillDTO,
  PerpPositionDTO,
  PerpSummaryDTO,
  SpotBalanceDTO,
  SpotSummaryDTO,
  StakingSummaryDTO,
} from './direccion-detalle.types.ts';

/** Función que devuelve el último mid conocido para una `midsKey` cruda. */
export type GetMidByMidsKey = (midsKey: string) => number | undefined;

export class AddressDetailService {
  constructor(
    private readonly source: IHyperliquidSource,
    private readonly meta: MetaService,
    private readonly getMid: GetMidByMidsKey,
  ) {}

  async spot(address: Address): Promise<SpotSummaryDTO> {
    const addr = this.normalize(address);
    const raw = await this.source.getSpotState(addr);
    const baseToUsdcMidsKey = await this.buildBaseToUsdcMidsKey();

    const balances: SpotBalanceDTO[] = [];
    let totalValueUsd = 0;
    let usdcDisponible = 0;

    for (const b of raw.balances) {
      const id = b.token; // base symbol como HYPE, USDC, PURR, etc.
      const upper = id.toUpperCase();
      const isUsdc = upper === 'USDC';
      const markPxUsdc = isUsdc
        ? 1
        : this.midOrUndefined(baseToUsdcMidsKey.get(upper));
      const valueUsd =
        markPxUsdc !== undefined ? b.total * markPxUsdc : undefined;
      if (valueUsd !== undefined) totalValueUsd += valueUsd;
      if (isUsdc) usdcDisponible += b.total;
      balances.push({
        id: upper,
        label: upper,
        total: b.total,
        hold: b.hold,
        available: Math.max(0, b.total - b.hold),
        entryNtl: b.entryNtl,
        markPxUsdc,
        valueUsd,
      });
    }

    // Ordenamos: primero USDC, luego por valor USD descendente.
    balances.sort((a, b) => {
      if (a.id === 'USDC') return -1;
      if (b.id === 'USDC') return 1;
      return (b.valueUsd ?? 0) - (a.valueUsd ?? 0);
    });

    return { balances, totalValueUsd, usdcDisponible };
  }

  async perps(address: Address): Promise<PerpSummaryDTO> {
    const addr = this.normalize(address);
    const raw = await this.source.getPerpState(addr);

    const posiciones: PerpPositionDTO[] = [];
    let unrealizedPnlTotal = 0;
    for (const p of raw.posiciones) {
      const info = await this.meta.resolveByFeedCoin(p.token);
      const id = info?.id ?? this.fallbackPerpId(p.token);
      const mercado: Mercado =
        info?.mercado ?? (p.token.includes(':') ? 'PerpHIP3' : 'PerpNativo');
      const side: 'LONG' | 'SHORT' = p.szi >= 0 ? 'LONG' : 'SHORT';
      const markPx =
        p.markPx ?? this.midOrUndefined(info?.midsKey ?? p.token);
      const roiPct =
        p.returnOnEquity !== undefined
          ? p.returnOnEquity * 100
          : p.marginUsed && p.marginUsed > 0
            ? (p.unrealizedPnl / p.marginUsed) * 100
            : undefined;
      const liquidationDistancePct =
        p.liquidationPx !== undefined && markPx !== undefined && markPx > 0
          ? ((side === 'LONG'
              ? markPx - p.liquidationPx
              : p.liquidationPx - markPx) /
              markPx) *
            100
          : undefined;
      posiciones.push({
        id,
        label: info?.label ?? id,
        mercado,
        side,
        size: p.szi,
        sizeAbs: Math.abs(p.szi),
        entryPx: p.entryPx,
        markPx,
        liquidationPx: p.liquidationPx,
        liquidationDistancePct,
        positionValue: p.positionValue,
        unrealizedPnl: p.unrealizedPnl,
        roiPct,
        leverage: p.leverage,
        leverageType: p.leverageType,
        maxLeverage: p.maxLeverage,
        marginUsed: p.marginUsed,
        cumFundingSinceOpen: p.cumFundingSinceOpen,
        cumFundingAllTime: p.cumFundingAllTime,
      });
      unrealizedPnlTotal += p.unrealizedPnl;
    }
    // Posiciones más grandes (notional) primero.
    posiciones.sort((a, b) => b.positionValue - a.positionValue);

    return {
      posiciones,
      accountValue: raw.accountValue,
      marginUsed: raw.marginUsed,
      totalNtlPos: raw.totalNtlPos,
      totalRawUsd: raw.totalRawUsd,
      withdrawable: raw.withdrawable ?? 0,
      crossMaintenanceMarginUsed: raw.crossMaintenanceMarginUsed,
      unrealizedPnlTotal,
    };
  }

  async staking(address: Address): Promise<StakingSummaryDTO> {
    const addr = this.normalize(address);
    const raw = await this.source.getStakingSummary(addr);
    return {
      delegated: raw.delegated,
      undelegated: raw.undelegated,
      totalPendingWithdrawal: raw.totalPendingWithdrawal,
      nPendingWithdrawals: raw.nPendingWithdrawals,
      stakingBalance: raw.delegated + raw.undelegated,
      delegations: raw.delegations
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .map((d) => ({
          validator: d.validator,
          amount: d.amount,
          lockedUntilTimestamp: d.lockedUntilTimestamp,
        })),
    };
  }

  async fills(address: Address, since?: number): Promise<FillDTO[]> {
    const addr = this.normalize(address);
    const raw = await this.source.getUserFills(addr, since);
    const out: FillDTO[] = [];
    for (const f of raw) {
      const info = await this.meta.resolveByFeedCoin(f.coin);
      const id = info?.id ?? this.fallbackPerpId(f.coin);
      out.push({
        id,
        label: info?.label ?? id,
        mercado: info?.mercado,
        side: f.side,
        px: f.px,
        sz: f.sz,
        notional: f.px * f.sz,
        time: f.time,
        hash: f.hash,
        fee: f.fee,
        closedPnl: f.closedPnl,
        dir: f.dir,
      });
    }
    return out;
  }

  // ---- helpers ----

  /**
   * Construye `BASE → midsKey de "<BASE>/USDC"` para tasar saldos spot
   * directamente contra USDC con el último `allMids`.
   */
  private async buildBaseToUsdcMidsKey(): Promise<Map<string, string>> {
    const cat = await this.meta.getCatalog();
    const map = new Map<string, string>();
    for (const t of cat.tokens as TokenInfo[]) {
      if (t.mercado !== 'Spot') continue;
      if (t.quote !== 'USDC') continue;
      map.set(t.base.toUpperCase(), t.midsKey);
    }
    return map;
  }

  private midOrUndefined(midsKey: string | undefined): number | undefined {
    if (!midsKey) return undefined;
    const v = this.getMid(midsKey);
    return Number.isFinite(v) ? (v as number) : undefined;
  }

  /**
   * Cuando el catálogo aún no conoce un coin (carrera durante el boot o
   * mercado recién listado), construimos un id heurístico:
   *   - `dex:SYMBOL`  → tal cual (ya es display).
   *   - Cualquier otra cosa → asumimos perp nativo y añadimos `.p`.
   */
  private fallbackPerpId(coin: TokenSymbol): string {
    if (coin.includes(':')) return coin;
    return `${coin.toUpperCase()}.p`;
  }

  private normalize(address: Address): Address {
    const a = address.trim().toLowerCase();
    if (!esAddressValida(a)) {
      throw new DireccionInvalida(`Dirección inválida: ${address}`);
    }
    return a;
  }
}

export type {
  SpotSummaryDTO,
  PerpSummaryDTO,
  StakingSummaryDTO,
  FillDTO,
  SpotBalanceDTO,
  PerpPositionDTO,
} from './direccion-detalle.types.ts';
