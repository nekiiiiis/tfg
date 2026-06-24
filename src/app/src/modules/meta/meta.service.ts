/**
 * Servicio de metadatos de Hyperliquid.
 *
 * Resuelve el "display token" (lo que ve el usuario en la UI) al identificador
 * que espera Hyperliquid en sus canales WS y en `allMids`.
 *
 *   - Perps (perp nativo):  display = "<SYMBOL>.p"      (ej. "BTC.p", "HYPE.p").
 *                           feedCoin = "<SYMBOL>"        (lo que viaja por el WS).
 *                           midsKey  = "<SYMBOL>"        (clave en `allMids`).
 *
 *   - Spot:                 display = "<base>/<quote>"  (HYPE/USDC ≠ HYPE/USDT).
 *                           feedCoin = "@<universe_index>".
 *                           midsKey  = "@<universe_index>".
 *
 *   - HIP3 (PerpHIP3):      display = "<dex>:<symbol>" (ej. "xyz:SP500").
 *                           feedCoin = "<dex>:<symbol>".
 *                           midsKey  = "<dex>:<symbol>".
 *
 * Anti rate-limit:
 *   - Las llamadas a `POST /info` se serializan con un token bucket interno
 *     (intervalo mínimo entre peticiones) para no excederse del weight/min.
 *   - Si Hyperliquid responde 429 se reintenta con backoff exponencial.
 *   - Un catálogo "vacío" (todas las llamadas fallaron) NO se cachea, así el
 *     siguiente intento (al recibir tráfico nuevo) lo vuelve a probar.
 *   - `refresh()` tiene cooldown: si la última carga válida es muy reciente,
 *     no se relanza para evitar tormentas cuando llegan claves de allMids
 *     que aún no estaban en el catálogo.
 */

import { logger } from '../../shared/logger.ts';
import type { Mercado, TokenSymbol } from '../../domain/types.ts';

export interface TokenInfo {
  /** Mercado al que pertenece. */
  mercado: Mercado;
  /** Identificador *visible* (el que viaja por la API y el front). */
  id: TokenSymbol;
  /** Identificador exacto que Hyperliquid usa en el WS de trades. */
  feedCoin: string;
  /** Clave correspondiente en el snapshot `allMids`. */
  midsKey: string;
  /** Etiqueta para UI (suele coincidir con `id`). */
  label: string;
  /** Activo base (sin quote ni dex, sin sufijo `.p`). */
  base: string;
  /** Activo cotizado (sólo Spot). */
  quote?: string;
  /** Nombre del dex HIP-3 (sólo PerpHIP3). */
  dex?: string;
  /** Decimales de tamaño / precio (informativo). */
  szDecimals?: number;
}

export interface PerpDex {
  name: string;
  fullName?: string;
  deployer?: string;
}

interface CacheEntry {
  tokens: TokenInfo[];
  dexs: PerpDex[];
  /** Mapa display→TokenInfo (id en mayúsculas). */
  byId: Map<string, TokenInfo>;
  /** Mapa feedCoin→TokenInfo (lo emite el WS). */
  byFeedCoin: Map<string, TokenInfo>;
  /** Mapa midsKey→TokenInfo (lo emite allMids). */
  byMidsKey: Map<string, TokenInfo>;
  generatedAt: number;
}

interface MetaServiceOptions {
  infoUrl: string;
  /** TTL del catálogo en memoria. */
  ttlMs?: number;
  /** Intervalo mínimo entre llamadas a /info (token bucket). */
  minIntervalMs?: number;
  /** Cooldown entre refresh() consecutivos exitosos. */
  refreshCooldownMs?: number;
  /** Máximo de reintentos al recibir 429. */
  maxRetries?: number;
}

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

export interface CandleBar {
  /** Epoch seconds (lightweight-charts). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface RawHlCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
}

export interface TopVolumeToken {
  mercado: Mercado;
  id: string;
  label: string;
  midsKey: string;
  /** Volumen notional 24h en USD. */
  dayNtlVlm: number;
  /** Precio mark más reciente (USD). */
  markPx: number;
}

interface RawAssetCtx {
  dayNtlVlm?: string;
  markPx?: string;
  midPx?: string;
  funding?: string;
  openInterest?: string;
}

type RawMetaAndAssetCtxs = [RawPerpMeta, RawAssetCtx[]];
type RawSpotMetaAndAssetCtxs = [RawSpotMeta, RawAssetCtx[]];

interface RawPerpMeta {
  universe: Array<{ name: string; szDecimals?: number; maxLeverage?: number }>;
}
interface RawSpotMetaToken {
  name: string;
  index: number;
  szDecimals?: number;
  weiDecimals?: number;
}
interface RawSpotMetaPair {
  name?: string;
  /** [baseTokenIndex, quoteTokenIndex] */
  tokens: [number, number];
  index: number;
  isCanonical?: boolean;
}
interface RawSpotMeta {
  tokens: RawSpotMetaToken[];
  universe: RawSpotMetaPair[];
}
type RawPerpDexs = Array<null | { name: string; full_name?: string; deployer?: string }>;

const DEFAULT_TTL = 30 * 60_000;
const DEFAULT_MIN_INTERVAL = 600;
const DEFAULT_REFRESH_COOLDOWN = 60_000;
const DEFAULT_MAX_RETRIES = 5;

class TokenBucket {
  private nextSlot = 0;
  constructor(private readonly intervalMs: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

export class MetaService {
  private cache: CacheEntry | null = null;
  private pending: Promise<CacheEntry> | null = null;
  private lastRefreshAt = 0;
  private readonly ttl: number;
  private readonly cooldown: number;
  private readonly maxRetries: number;
  private readonly bucket: TokenBucket;

  constructor(private readonly opts: MetaServiceOptions) {
    this.ttl = opts.ttlMs ?? DEFAULT_TTL;
    this.cooldown = opts.refreshCooldownMs ?? DEFAULT_REFRESH_COOLDOWN;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.bucket = new TokenBucket(opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL);
  }

  /** Devuelve el catálogo, refrescándolo si está caducado. */
  async getCatalog(): Promise<CacheEntry> {
    const now = Date.now();
    if (this.cache && now - this.cache.generatedAt < this.ttl) {
      return this.cache;
    }
    if (this.pending) return this.pending;
    this.pending = this.loadCatalog()
      .then((entry) => {
        if (entry.tokens.length > 0) {
          // Sólo cacheamos cuando hay datos reales. Un catálogo vacío sugiere
          // que /info nos rate-limiteó: dejamos null para que el próximo
          // consumidor reintente (con throttle).
          this.cache = entry;
          this.lastRefreshAt = entry.generatedAt;
          logger.info(
            { tokens: entry.tokens.length, dexs: entry.dexs.length },
            'MetaService: catálogo de Hyperliquid cargado',
          );
        } else {
          logger.warn(
            'MetaService: carga del catálogo devolvió 0 tokens (rate-limit); reintentaremos bajo demanda',
          );
        }
        return entry;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  /**
   * Fuerza una recarga ignorando el TTL, pero respetando un cooldown mínimo
   * desde la última carga válida. Esto evita que llaves desconocidas en
   * `allMids` desencadenen tormentas de /info.
   */
  async refresh(): Promise<CacheEntry> {
    if (this.pending) return this.pending;
    const now = Date.now();
    if (this.cache && now - this.lastRefreshAt < this.cooldown) {
      return this.cache;
    }
    this.cache = null;
    return this.getCatalog();
  }

  async listTokens(mercado?: Mercado): Promise<TokenInfo[]> {
    const cat = await this.getCatalog();
    if (!mercado) return cat.tokens;
    return cat.tokens.filter((t) => t.mercado === mercado);
  }

  async listPerpDexs(): Promise<PerpDex[]> {
    const cat = await this.getCatalog();
    return cat.dexs;
  }

  /** Resuelve un display token a su entrada de catálogo. */
  async resolveToken(
    mercado: Mercado,
    displayToken: TokenSymbol,
  ): Promise<TokenInfo | null> {
    let cat = await this.getCatalog();
    const upper = displayToken.toUpperCase();
    let info = cat.byId.get(upper);
    if (!info && cat.tokens.length === 0) {
      // El catálogo vino vacío (probable rate-limit en boot). Esperamos a la
      // próxima carga antes de declarar el token como desconocido.
      cat = await this.refresh();
      info = cat.byId.get(upper);
    }
    return info ?? null;
  }

  /** Inverso de `resolveToken`: dado lo que llega por WS, devuelve el display. */
  async resolveByFeedCoin(feedCoin: string): Promise<TokenInfo | null> {
    const cat = await this.getCatalog();
    return cat.byFeedCoin.get(feedCoin) ?? null;
  }

  /** Inverso de `resolveToken` por clave de `allMids`. */
  async resolveByMidsKey(midsKey: string): Promise<TokenInfo | null> {
    const cat = await this.getCatalog();
    return cat.byMidsKey.get(midsKey) ?? null;
  }

  /**
   * Devuelve un mapa midsKey→display construido del catálogo actual.
   * Sincrónico: si todavía no se ha cargado el catálogo, devuelve mapa vacío.
   * Pensado para hot paths (cada batch de `allMids` lo consulta).
   */
  getMidsKeyToDisplay(): Map<string, string> {
    const out = new Map<string, string>();
    if (!this.cache) return out;
    for (const t of this.cache.tokens) out.set(t.midsKey, t.id);
    return out;
  }

  /**
   * Obtiene los top-N tokens por volumen 24h sumando perp nativo, spot y
   * HIP3. Llama a `metaAndAssetCtxs` y `spotMetaAndAssetCtxs` con la misma
   * política de throttle + reintentos.
   *
   * El resultado se cachea durante `ttlMs` para no recalcular en cada
   * petición del ticker.
   */
  async getTopByVolume(limit = 40): Promise<TopVolumeToken[]> {
    const now = Date.now();
    if (
      this.volumesCache &&
      now - this.volumesCache.generatedAt < this.volumesTtl
    ) {
      return this.volumesCache.tokens.slice(0, limit);
    }
    if (this.volumesPending) return (await this.volumesPending).slice(0, limit);
    this.volumesPending = this.loadTopByVolume()
      .then((tokens) => {
        if (tokens.length > 0) {
          this.volumesCache = { tokens, generatedAt: Date.now() };
        }
        return tokens;
      })
      .finally(() => {
        this.volumesPending = null;
      });
    const all = await this.volumesPending;
    return all.slice(0, limit);
  }

  private async loadTopByVolume(): Promise<TopVolumeToken[]> {
    // Aseguramos catálogo cargado para poder mapear índices spot→display.
    const cat = await this.getCatalog();
    const [perpRaw, spotRaw] = await Promise.all([
      this.callInfo<RawMetaAndAssetCtxs>({ type: 'metaAndAssetCtxs' }).catch(
        () => null,
      ),
      this.callInfo<RawSpotMetaAndAssetCtxs>({
        type: 'spotMetaAndAssetCtxs',
      }).catch(() => null),
    ]);

    const out: TopVolumeToken[] = [];

    if (perpRaw && Array.isArray(perpRaw) && perpRaw.length === 2) {
      const [meta, ctxs] = perpRaw;
      for (let i = 0; i < (meta.universe ?? []).length; i += 1) {
        const u = meta.universe[i];
        const c = ctxs?.[i];
        if (!u?.name || !c) continue;
        const base = u.name.toUpperCase();
        const id = `${base}.p`;
        const info = cat.byId.get(id);
        out.push({
          mercado: 'PerpNativo',
          id,
          label: info?.label ?? id,
          midsKey: info?.midsKey ?? u.name,
          dayNtlVlm: Number(c.dayNtlVlm ?? 0),
          markPx: Number(c.markPx ?? c.midPx ?? 0),
        });
      }
    }

    if (spotRaw && Array.isArray(spotRaw) && spotRaw.length === 2) {
      const [spotMeta, ctxs] = spotRaw;
      const tokensList = spotMeta.tokens ?? [];
      for (let i = 0; i < (spotMeta.universe ?? []).length; i += 1) {
        const pair = spotMeta.universe[i];
        const c = ctxs?.[i];
        if (!pair || !c) continue;
        const baseTok = tokensList.find((t) => t.index === pair.tokens?.[0]);
        const quoteTok = tokensList.find((t) => t.index === pair.tokens?.[1]);
        if (!baseTok || !quoteTok) continue;
        const id = `${baseTok.name.toUpperCase()}/${quoteTok.name.toUpperCase()}`;
        const feedCoin = `@${pair.index}`;
        const info = cat.byId.get(id);
        out.push({
          mercado: 'Spot',
          id,
          label: info?.label ?? id,
          midsKey: info?.midsKey ?? feedCoin,
          dayNtlVlm: Number(c.dayNtlVlm ?? 0),
          markPx: Number(c.markPx ?? c.midPx ?? 0),
        });
      }
    }

    out.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
    return out;
  }

  // Volumen 24h: cache propia, TTL más corto que el catálogo.
  private volumesCache: { tokens: TopVolumeToken[]; generatedAt: number } | null =
    null;
  private volumesPending: Promise<TopVolumeToken[]> | null = null;
  private readonly volumesTtl = 60_000;

  /**
   * Velas OHLC para un token display. Usa `candleSnapshot` de Hyperliquid con
   * el `feedCoin` resuelto por el catálogo.
   */
  async getCandles(
    mercado: Mercado,
    displayToken: TokenSymbol,
    interval: HlChartInterval,
    lookbackMs: number,
  ): Promise<{ feedCoin: string; velas: CandleBar[] }> {
    const info = await this.resolveToken(mercado, displayToken);
    if (!info) {
      throw new Error(`Token desconocido: ${displayToken} (${mercado})`);
    }
    const cacheKey = `${mercado}|${displayToken.toUpperCase()}|${interval}|${lookbackMs}`;
    const now = Date.now();
    const hit = this.candlesCache.get(cacheKey);
    if (hit && now - hit.generatedAt < this.candlesTtl) {
      return { feedCoin: info.feedCoin, velas: hit.velas };
    }
    const endTime = now;
    const startTime = endTime - lookbackMs;
    const raw = await this.callInfo<RawHlCandle[]>({
      type: 'candleSnapshot',
      req: {
        coin: info.feedCoin,
        interval,
        startTime,
        endTime,
      },
    });
    const velas: CandleBar[] = (raw ?? [])
      .map((c) => ({
        time: Math.floor(c.t / 1000),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
      }))
      .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time);
    this.candlesCache.set(cacheKey, { velas, generatedAt: now });
    return { feedCoin: info.feedCoin, velas };
  }

  private candlesCache = new Map<
    string,
    { velas: CandleBar[]; generatedAt: number }
  >();
  private readonly candlesTtl = 30_000;

  // ---- internos ----

  private async loadCatalog(): Promise<CacheEntry> {
    // Lanzamos las consultas en secuencia (gracias al bucket interno) para
    // que el throttle se respete; usamos Promise.all como conveniencia pero
    // el bucket serializa el acquire().
    const [perpMetaRaw, spotMetaRaw, perpDexsRaw] = await Promise.all([
      this.callInfo<RawPerpMeta>({ type: 'meta' }).catch((err) => {
        logger.warn(
          { err: (err as Error).message },
          'MetaService: meta falló tras reintentos',
        );
        return { universe: [] } as RawPerpMeta;
      }),
      this.callInfo<RawSpotMeta>({ type: 'spotMeta' }).catch((err) => {
        logger.warn(
          { err: (err as Error).message },
          'MetaService: spotMeta falló tras reintentos',
        );
        return { tokens: [], universe: [] } as RawSpotMeta;
      }),
      this.callInfo<RawPerpDexs>({ type: 'perpDexs' }).catch(
        () => [] as RawPerpDexs,
      ),
    ]);

    const tokens: TokenInfo[] = [];

    // ---- Perps (perp nativo) ----
    for (const u of perpMetaRaw.universe ?? []) {
      if (!u?.name) continue;
      const base = u.name.toUpperCase();
      const id = `${base}.p`;
      tokens.push({
        mercado: 'PerpNativo',
        id,
        feedCoin: u.name,
        midsKey: u.name,
        label: id,
        base,
        szDecimals: u.szDecimals,
      });
    }

    // ---- Spot ----
    const spotTokens = spotMetaRaw.tokens ?? [];
    for (const pair of spotMetaRaw.universe ?? []) {
      const baseIdx = pair.tokens?.[0];
      const quoteIdx = pair.tokens?.[1];
      const base = spotTokens.find((t) => t.index === baseIdx);
      const quote = spotTokens.find((t) => t.index === quoteIdx);
      if (!base || !quote) continue;
      const baseU = base.name.toUpperCase();
      const quoteU = quote.name.toUpperCase();
      const id = `${baseU}/${quoteU}`;
      const feedCoin = `@${pair.index}`;
      tokens.push({
        mercado: 'Spot',
        id,
        feedCoin,
        midsKey: feedCoin,
        label: id,
        base: baseU,
        quote: quoteU,
        szDecimals: base.szDecimals,
      });
    }

    // ---- HIP3 ----
    const dexs: PerpDex[] = [];
    for (const d of perpDexsRaw ?? []) {
      if (!d?.name) continue;
      dexs.push({ name: d.name, fullName: d.full_name, deployer: d.deployer });
    }
    if (dexs.length > 0) {
      // Serializamos también los HIP3 metas; los lanzamos secuencialmente para
      // no machacar el bucket en burst y darle prioridad al global meta arriba.
      const dexMetas: Array<{ dex: PerpDex; meta: RawPerpMeta }> = [];
      for (const d of dexs) {
        const meta = await this.callInfo<RawPerpMeta>({
          type: 'meta',
          dex: d.name,
        }).catch((err) => {
          logger.warn(
            { err: (err as Error).message, dex: d.name },
            'MetaService: meta HIP-3 falló tras reintentos',
          );
          return { universe: [] } as RawPerpMeta;
        });
        dexMetas.push({ dex: d, meta });
      }
      for (const { dex, meta } of dexMetas) {
        for (const u of meta.universe ?? []) {
          if (!u?.name) continue;
          // Algunos dex devuelven `u.name` ya prefijado ("XYZ:SP500"); HL
          // espera `feedCoin` como `dex:SYMBOL` (lowercase dex + symbol
          // limpio). Quitamos el prefijo del dex del nombre si lo trae.
          const raw = u.name.toUpperCase();
          const colonIdx = raw.lastIndexOf(':');
          const symbol = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
          if (!symbol) continue;
          const id = `${dex.name}:${symbol}`;
          tokens.push({
            mercado: 'PerpHIP3',
            id,
            feedCoin: id,
            midsKey: id,
            label: id,
            base: symbol,
            dex: dex.name,
            szDecimals: u.szDecimals,
          });
        }
      }
    }

    tokens.sort((a, b) => {
      if (a.mercado !== b.mercado) return a.mercado.localeCompare(b.mercado);
      return a.id.localeCompare(b.id);
    });

    const byId = new Map<string, TokenInfo>();
    const byFeedCoin = new Map<string, TokenInfo>();
    const byMidsKey = new Map<string, TokenInfo>();
    for (const t of tokens) {
      byId.set(t.id.toUpperCase(), t);
      byFeedCoin.set(t.feedCoin, t);
      byMidsKey.set(t.midsKey, t);
      // Alias útiles para compatibilidad / robustez:
      if (t.mercado === 'PerpNativo') {
        // Aceptamos el símbolo desnudo ("BTC") además de "BTC.p" para no romper
        // alertas viejas o llamadas externas.
        byId.set(t.base.toUpperCase(), t);
      }
      if (t.mercado === 'Spot') {
        // Aceptamos "@<idx>" como alias del par.
        byId.set(t.feedCoin, t);
      }
    }
    return {
      tokens,
      dexs,
      byId,
      byFeedCoin,
      byMidsKey,
      generatedAt: Date.now(),
    };
  }

  /** Hace una /info respetando el bucket y reintentando si llega 429. */
  private async callInfo<T>(body: Record<string, unknown>): Promise<T> {
    let attempt = 0;
    let backoff = 1500;
    while (true) {
      await this.bucket.acquire();
      try {
        const res = await fetch(this.opts.infoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429) {
          throw new RateLimitedError(
            `Hyperliquid /info ${String(body['type'])} → HTTP 429`,
          );
        }
        if (!res.ok) {
          throw new Error(
            `Hyperliquid /info ${String(body['type'])} → HTTP ${res.status}`,
          );
        }
        return (await res.json()) as T;
      } catch (err) {
        const isRetryable =
          err instanceof RateLimitedError ||
          (err instanceof Error && /timeout/i.test(err.message));
        if (!isRetryable || attempt >= this.maxRetries) throw err;
        attempt += 1;
        const wait = Math.min(backoff, 30_000);
        logger.warn(
          { err: (err as Error).message, attempt, waitMs: wait },
          'MetaService: rate-limit en /info, reintentando',
        );
        await new Promise((r) => setTimeout(r, wait));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }
}

class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitedError';
  }
}
