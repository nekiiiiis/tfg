/**
 * Saldos "ligeros" para enriquecer la tabla del leaderboard.
 *
 * Dada una lista de addresses y la terna (mercado, token) que el usuario
 * está mirando, devuelve para cada address:
 *
 *   - `usdAvailable`: dólares disponibles en la cuenta del mercado activo.
 *       · Spot   → suma de stablecoins (USDC + USDT + USDH + USDE) `available`.
 *       · Perps  → `withdrawable` del clearinghouse nativo.
 *       · HIP3   → `withdrawable` del clearinghouse del dex correspondiente.
 *
 *   - `tokenAvailable`: cuántos tokens del activo concreto le quedan
 *     "vendibles" (sin entrar en USD).
 *       · Spot   → balance del token base (HYPE, BTC…) `available`.
 *       · Perps  → tamaño absoluto de la posición LONG abierta (si está SHORT
 *         no hay tokens long que vender; se devuelve 0).
 *       · HIP3   → ídem que Perps con el coin del dex.
 *
 * Concurrencia: Hyperliquid aguanta sin problema 100 peticiones en paralelo
 * para `clearinghouseState` y `spotClearinghouseState`, así que disparamos
 * `Promise.allSettled` directamente. Si HL responde 429 hacemos un reintento
 * con backoff acotado.
 *
 * Cache LRU por (mercado, token, address) con TTL configurable: el usuario
 * puede pedir varias veces seguidas (scroll, cambio de lado) sin recalcular.
 */

import { logger } from '../../shared/logger.ts';
import type { Mercado } from '../../domain/types.ts';
import type { MetaService } from '../meta/meta.service.ts';

const USD_STABLECOINS = new Set(['USDC', 'USDT', 'USDH', 'USDE']);

export interface LeaderboardBalance {
  direccion: string;
  usdAvailable: number | null;
  tokenAvailable: number | null;
  /** Símbolo amigable del token (lo que se muestra junto al número). */
  tokenSymbol: string;
}

interface CacheEntry {
  data: LeaderboardBalance;
  at: number;
}

interface ServiceOptions {
  infoUrl: string;
  /** TTL del cache por address (ms). */
  ttlMs?: number;
  /** Máximo de addresses por batch (las que sobran se rechazan). */
  maxBatch?: number;
}

interface SpotBalanceRaw {
  coin: string;
  total: string;
  hold: string;
}
interface SpotStateRaw {
  balances?: SpotBalanceRaw[];
}
interface PerpPositionRaw {
  position: { coin: string; szi: string };
}
interface PerpStateRaw {
  withdrawable?: string;
  marginSummary?: { accountValue?: string };
  assetPositions?: PerpPositionRaw[];
}

export class LeaderboardBalancesService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxBatch: number;

  constructor(
    private readonly opts: ServiceOptions,
    private readonly meta: MetaService,
  ) {
    this.ttlMs = opts.ttlMs ?? 20_000;
    this.maxBatch = opts.maxBatch ?? 100;
  }

  async getBatch(
    mercado: Mercado,
    displayToken: string,
    addresses: string[],
  ): Promise<LeaderboardBalance[]> {
    if (addresses.length === 0) return [];
    const info = await this.meta.resolveToken(mercado, displayToken);
    if (!info) {
      throw new Error(
        `Token desconocido para ${mercado}: ${displayToken}`,
      );
    }
    const limited = addresses.slice(0, this.maxBatch);
    const now = Date.now();
    const fresh: string[] = [];
    const cached: LeaderboardBalance[] = [];
    for (const addr of limited) {
      const key = this.cacheKey(mercado, info.id, addr);
      const hit = this.cache.get(key);
      if (hit && now - hit.at < this.ttlMs) {
        cached.push(hit.data);
      } else {
        fresh.push(addr.toLowerCase());
      }
    }

    if (fresh.length > 0) {
      const fetched = await this.fetchAll(mercado, info, fresh);
      for (const item of fetched) {
        const key = this.cacheKey(mercado, info.id, item.direccion);
        this.cache.set(key, { data: item, at: now });
        cached.push(item);
      }
    }

    // Devuelve en el orden recibido.
    const byAddr = new Map<string, LeaderboardBalance>();
    for (const c of cached) byAddr.set(c.direccion, c);
    return limited.map(
      (a) =>
        byAddr.get(a.toLowerCase()) ?? {
          direccion: a.toLowerCase(),
          usdAvailable: null,
          tokenAvailable: null,
          tokenSymbol: info.base,
        },
    );
  }

  private cacheKey(mercado: Mercado, tokenId: string, addr: string): string {
    return `${mercado}|${tokenId}|${addr.toLowerCase()}`;
  }

  private async fetchAll(
    mercado: Mercado,
    info: { feedCoin: string; base: string; dex?: string },
    addresses: string[],
  ): Promise<LeaderboardBalance[]> {
    const results = await Promise.allSettled(
      addresses.map((addr) => this.fetchOne(mercado, info, addr)),
    );
    const out: LeaderboardBalance[] = [];
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i]!;
      const addr = addresses[i]!;
      if (r.status === 'fulfilled') {
        out.push(r.value);
      } else {
        logger.warn(
          { addr, err: (r.reason as Error).message },
          'leaderboard-balances: fetch falló',
        );
        out.push({
          direccion: addr,
          usdAvailable: null,
          tokenAvailable: null,
          tokenSymbol: info.base,
        });
      }
    }
    return out;
  }

  private async fetchOne(
    mercado: Mercado,
    info: { feedCoin: string; base: string; dex?: string },
    addr: string,
  ): Promise<LeaderboardBalance> {
    if (mercado === 'Spot') {
      const raw = await this.postInfo<SpotStateRaw>({
        type: 'spotClearinghouseState',
        user: addr,
      });
      let usd = 0;
      let tok = 0;
      for (const b of raw.balances ?? []) {
        const total = Number(b.total);
        const hold = Number(b.hold);
        if (!Number.isFinite(total)) continue;
        const available = Math.max(0, total - (Number.isFinite(hold) ? hold : 0));
        const coin = b.coin?.toUpperCase();
        if (!coin) continue;
        if (USD_STABLECOINS.has(coin)) usd += available;
        if (coin === info.base.toUpperCase()) tok = available;
      }
      return {
        direccion: addr,
        usdAvailable: usd,
        tokenAvailable: tok,
        tokenSymbol: info.base,
      };
    }
    // Perps nativos y HIP3
    const body: Record<string, unknown> = {
      type: 'clearinghouseState',
      user: addr,
    };
    if (mercado === 'PerpHIP3' && info.dex) body['dex'] = info.dex;
    const raw = await this.postInfo<PerpStateRaw>(body);
    const usd = Number(raw.withdrawable ?? 0);
    let tok = 0;
    for (const p of raw.assetPositions ?? []) {
      if (p?.position?.coin !== info.feedCoin) continue;
      const szi = Number(p.position.szi);
      tok = szi > 0 ? szi : 0;
      break;
    }
    return {
      direccion: addr,
      usdAvailable: Number.isFinite(usd) ? usd : null,
      tokenAvailable: Number.isFinite(tok) ? tok : null,
      tokenSymbol: info.base,
    };
  }

  /** POST /info con reintento simple para 429. */
  private async postInfo<T>(body: Record<string, unknown>): Promise<T> {
    let attempt = 0;
    while (true) {
      const res = await fetch(this.opts.infoUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 200) return (await res.json()) as T;
      if (res.status === 429 && attempt < 3) {
        const wait = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, wait));
        attempt += 1;
        continue;
      }
      throw new Error(`HL /info ${String(body['type'])} → HTTP ${res.status}`);
    }
  }
}
