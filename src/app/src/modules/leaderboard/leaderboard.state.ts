/**
 * Estado in-memory del leaderboard con ventana deslizante.
 *
 * Estructura por terna (mercado, token, temporalidad):
 *   - `byAddress`: agregados (volumenCompra/Venta) por dirección, calculados
 *     sumando las operaciones dentro de la ventana.
 *   - `ops`: cola ordenada cronológicamente de operaciones individuales que
 *     pertenecen a la ventana. Al insertar, purgamos del frente las que ya
 *     han caducado y restamos su volumen del agregado.
 *
 * Reemplaza el Sorted Set de Redis del cap. 3 sin perder propiedades:
 *   - Inserción O(1) en cola + actualización O(1) del Map.
 *   - Purga amortizada O(k) donde k = ops caducadas en este tick.
 *   - Top-N: O(N) sobre `byAddress`.
 *
 * Se aplica un tope `maxOps` por terna como salvaguarda ante feeds anómalos.
 */

import type {
  Address,
  Lado,
  Mercado,
  Operacion,
  Temporalidad,
  Terna,
  TokenSymbol,
} from '../../domain/types.ts';

export interface FilaLeaderboard {
  direccion: Address;
  volumenCompra: number;
  volumenVenta: number;
  /** Volumen total (compra + venta). Útil como criterio de orden por defecto. */
  volumenTotal: number;
}

export interface LeaderboardSnapshot {
  terna: Terna;
  generadoEn: number;
  filas: FilaLeaderboard[];
}

interface Aggregate {
  volBuy: number;
  volSell: number;
}

interface QueueOp {
  ts: number;
  addr: Address;
  vol: number;
  lado: 'BUY' | 'SELL';
}

interface TernaState {
  windowSeconds: number;
  ops: QueueOp[];
  byAddress: Map<Address, Aggregate>;
}

const ternaKey = (t: Terna): string =>
  `${t.mercado}|${t.token}|${t.temporalidad}`;

export class LeaderboardState {
  private readonly ternas = new Map<string, TernaState>();

  constructor(
    private readonly windowSecondsByTemp: Record<Temporalidad, number>,
    private readonly maxOps: number,
  ) {}

  /**
   * Asegura que existe el estado para la terna y aplica una nueva operación.
   * Devuelve el estado actualizado (mismo objeto en sucesivas llamadas).
   */
  ingest(t: Terna, op: Operacion): TernaState {
    const key = ternaKey(t);
    let state = this.ternas.get(key);
    if (!state) {
      state = {
        windowSeconds: this.windowSecondsByTemp[t.temporalidad],
        ops: [],
        byAddress: new Map(),
      };
      this.ternas.set(key, state);
    }
    this.purgeExpired(state, op.ts);
    const entry: QueueOp = {
      ts: op.ts,
      addr: op.direccion,
      vol: op.volumenUsd,
      lado: op.lado,
    };
    state.ops.push(entry);
    if (state.ops.length > this.maxOps) {
      // Cap: descartamos las más antiguas hasta caber. Equivale a una purga forzada.
      const exceso = state.ops.length - this.maxOps;
      for (let i = 0; i < exceso; i += 1) {
        const old = state.ops[i]!;
        this.applyDelta(state, old, -1);
      }
      state.ops.splice(0, exceso);
    }
    this.applyDelta(state, entry, 1);
    return state;
  }

  /**
   * Ingiere un lote de operaciones (backfill REST o polling de seguridad)
   * sobre una terna. A diferencia de `ingest`, no es responsable de
   * "abanicar" a otras temporalidades — el caller decide. Las operaciones
   * deben venir ordenadas por `ts` ascendente.
   *
   * Hace de-duplicado básico contra el último timestamp ya conocido por la
   * terna para que las pasadas sucesivas de polling no inflen los volúmenes.
   * Devuelve el `ts` más reciente que ha quedado en la cola.
   */
  ingestBackfill(t: Terna, ops: ReadonlyArray<Operacion>): number {
    if (ops.length === 0) return 0;
    const key = ternaKey(t);
    let state = this.ternas.get(key);
    if (!state) {
      state = {
        windowSeconds: this.windowSecondsByTemp[t.temporalidad],
        ops: [],
        byAddress: new Map(),
      };
      this.ternas.set(key, state);
    }
    const lastTs = state.ops.length > 0 ? state.ops[state.ops.length - 1]!.ts : 0;
    for (const op of ops) {
      if (op.ts <= lastTs) continue;
      this.ingest(t, op);
    }
    return state.ops.length > 0 ? state.ops[state.ops.length - 1]!.ts : lastTs;
  }

  /**
   * Genera el top-N de una terna.
   *
   * El parámetro `lado` controla *el criterio de orden y filtrado*:
   *   - 'ALL'  → ordena por compra+venta. Mantiene filas con cualquier actividad.
   *   - 'BUY'  → sólo filas con volumen de compra > 0, ordenadas por compra.
   *   - 'SELL' → sólo filas con volumen de venta > 0, ordenadas por venta.
   *
   * Las dos columnas (compra y venta) siempre se rellenan para que el
   * frontend pueda mostrar el contexto, aunque ordene por una sola.
   */
  snapshot(
    t: Terna,
    topN: number,
    lado: Lado = 'ALL',
    now: number = Date.now(),
  ): LeaderboardSnapshot {
    const key = ternaKey(t);
    const state = this.ternas.get(key);
    if (!state) {
      return { terna: t, generadoEn: now, filas: [] };
    }
    this.purgeExpired(state, now);
    const filas: FilaLeaderboard[] = [];
    for (const [addr, agg] of state.byAddress.entries()) {
      if (agg.volBuy === 0 && agg.volSell === 0) continue;
      if (lado === 'BUY' && agg.volBuy <= 0) continue;
      if (lado === 'SELL' && agg.volSell <= 0) continue;
      filas.push({
        direccion: addr,
        volumenCompra: agg.volBuy,
        volumenVenta: agg.volSell,
        volumenTotal: agg.volBuy + agg.volSell,
      });
    }
    filas.sort((a, b) => {
      if (lado === 'BUY') return b.volumenCompra - a.volumenCompra;
      if (lado === 'SELL') return b.volumenVenta - a.volumenVenta;
      return b.volumenTotal - a.volumenTotal;
    });
    if (topN > 0 && filas.length > topN) filas.length = topN;
    return { terna: t, generadoEn: now, filas };
  }

  /**
   * Devuelve todas las temporalidades activas para un token dado en un
   * mercado dado. Útil para "abanicar" un trade entrante a las distintas
   * ventanas que estén suscritas en este momento.
   */
  ternasActivasFor(
    mercado: Mercado,
    token: TokenSymbol,
  ): Temporalidad[] {
    const out: Temporalidad[] = [];
    const prefix = `${mercado}|${token}|`;
    for (const key of this.ternas.keys()) {
      if (key.startsWith(prefix)) {
        out.push(key.slice(prefix.length) as Temporalidad);
      }
    }
    return out;
  }

  /** Garantiza la existencia de la terna (precondición para `ingest` eficiente). */
  ensureTerna(t: Terna): void {
    const key = ternaKey(t);
    if (!this.ternas.has(key)) {
      this.ternas.set(key, {
        windowSeconds: this.windowSecondsByTemp[t.temporalidad],
        ops: [],
        byAddress: new Map(),
      });
    }
  }

  // ---- internos ----

  private applyDelta(state: TernaState, op: QueueOp, sign: 1 | -1): void {
    let agg = state.byAddress.get(op.addr);
    if (!agg) {
      if (sign === -1) return;
      agg = { volBuy: 0, volSell: 0 };
      state.byAddress.set(op.addr, agg);
    }
    if (op.lado === 'BUY') agg.volBuy += sign * op.vol;
    else agg.volSell += sign * op.vol;
    // Limpieza de direcciones con todo a 0 para no inflar el Map.
    if (agg.volBuy <= 0 && agg.volSell <= 0) {
      state.byAddress.delete(op.addr);
    }
  }

  private purgeExpired(state: TernaState, now: number): void {
    const cutoff = now - state.windowSeconds * 1000;
    let removed = 0;
    // Avanzamos `removed` mientras el siguiente elemento (no el primero
    // absoluto) siga caducado. Antes el while comprobaba `state.ops[0]`
    // pero accedíamos a `state.ops[removed]`, lo que se salía del array
    // cuando todas las operaciones de la ventana estaban caducadas.
    while (
      removed < state.ops.length &&
      state.ops[removed]!.ts < cutoff
    ) {
      const old = state.ops[removed]!;
      this.applyDelta(state, old, -1);
      removed += 1;
    }
    if (removed > 0) state.ops.splice(0, removed);
  }
}
