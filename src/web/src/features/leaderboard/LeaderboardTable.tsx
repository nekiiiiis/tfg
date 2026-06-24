import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { api, type FilaLeaderboard, type Mercado } from '@/core/api';
import {
  LADO_SHORT,
  volumenPorLado,
  type LeaderboardLado,
} from '@/core/domain';
import {
  formatTokenAmount,
  formatUsd,
  formatUsdCompact,
  shortAddress,
} from '@/core/format';
import { cn } from '@/core/cn';
import { useBalances } from './useBalances';

interface Props {
  filas: FilaLeaderboard[];
  lado: LeaderboardLado;
  mercado: Mercado;
  token: string;
}

interface ResolverResp {
  entradas: Array<{ valor: string; entidadId: string; nombre: string }>;
}

const NAME_RESOLVE_MAX = 200;
const RESOLVE_BATCH = 50;
const RESOLVE_DEBOUNCE_MS = 250;

/**
 * Tabla virtualizada del leaderboard.
 *
 *   Columnas:
 *     # · Dirección / Entidad · Volumen (BUY|SELL) · Disponible (USD o tokens)
 *
 *   - Si `lado === 'BUY'`: la columna "Disponible" muestra los **dólares
 *     totales** que la address tiene en el mercado activo (suma de
 *     stablecoins en spot o `withdrawable` en perps/HIP3).
 *   - Si `lado === 'SELL'`: muestra los **tokens del activo** que aún tiene
 *     disponibles para vender (balance spot del base o posición LONG abierta).
 *
 *   Las columnas tienen anchos reservados (`grid-cols`) y los hijos usan
 *   `min-w-0 truncate` para que ninguna dirección se salga de la cuadrícula.
 */
export default function LeaderboardTable({
  filas,
  lado,
  mercado,
  token,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const [, forceTick] = useState(0);
  const bump = useCallback(() => forceTick((n) => n + 1), []);

  const sortedFilas = useMemo(() => {
    const copy = [...filas];
    copy.sort(
      (a, b) => volumenPorLado(b, lado) - volumenPorLado(a, lado),
    );
    return copy;
  }, [filas, lado]);

  const topDirecciones = useMemo(
    () =>
      sortedFilas.slice(0, NAME_RESOLVE_MAX).map((f) => f.direccion.toLowerCase()),
    [sortedFilas],
  );

  // Resolución de nombres de entidades (existente).
  useEffect(() => {
    const pendientes = topDirecciones.filter(
      (d) => !cacheRef.current.has(d) && !inFlightRef.current.has(d),
    );
    if (pendientes.length === 0) return;
    const id = setTimeout(() => {
      const cache = cacheRef.current;
      const inFlight = inFlightRef.current;
      const batches: string[][] = [];
      for (let i = 0; i < pendientes.length; i += RESOLVE_BATCH) {
        batches.push(pendientes.slice(i, i + RESOLVE_BATCH));
      }
      for (const dir of pendientes) inFlight.add(dir);
      for (const batch of batches) {
        api
          .post<ResolverResp>('/api/direcciones/resolver', {
            direcciones: batch,
          })
          .then((r) => {
            const set = new Set<string>();
            for (const e of r.entradas) {
              const k = e.valor.toLowerCase();
              cache.set(k, e.nombre);
              set.add(k);
            }
            for (const d of batch) if (!set.has(d)) cache.set(d, '');
          })
          .catch(() => undefined)
          .finally(() => {
            for (const d of batch) inFlight.delete(d);
            bump();
          });
      }
    }, RESOLVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [topDirecciones, bump]);

  // Saldos / posiciones por address (nuevo).
  const { byAddr: balances, tokenSymbol } = useBalances({
    mercado,
    token,
    addresses: topDirecciones,
  });

  const nombres = cacheRef.current;
  const volLabel = LADO_SHORT[lado];

  const rowVirtualizer = useVirtualizer({
    count: sortedFilas.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  const headerCols =
    'grid-cols-[44px_minmax(0,1fr)_minmax(96px,128px)_minmax(112px,140px)]';

  if (sortedFilas.length === 0) {
    return (
      <div className="flex h-96 flex-1 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
        Esperando trades del feed…
      </div>
    );
  }

  const disponibleLabel = lado === 'BUY' ? '$ disponibles' : `${tokenSymbol} libres`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div
        className={cn(
          'grid items-center gap-3 border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground',
          headerCols,
        )}
      >
        <div className="text-right">#</div>
        <div className="min-w-0">Dirección</div>
        <div
          className={cn(
            'text-right font-semibold',
            lado === 'BUY' ? 'text-buy' : 'text-sell',
          )}
        >
          {volLabel} ↓
        </div>
        <div className="text-right">{disponibleLabel}</div>
      </div>
      <div
        ref={parentRef}
        className="relative min-h-[360px] flex-1 overflow-y-auto overflow-x-hidden tabular-nums"
      >
        <div
          style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
        >
          {rowVirtualizer.getVirtualItems().map((row) => {
            const fila = sortedFilas[row.index]!;
            const vol = volumenPorLado(fila, lado);
            const nombre = nombres.get(fila.direccion.toLowerCase());
            const bal = balances.get(fila.direccion.toLowerCase());
            const disponible =
              lado === 'BUY' ? bal?.usdAvailable : bal?.tokenAvailable;
            return (
              <div
                key={fila.direccion}
                className={cn(
                  'absolute inset-x-0 grid items-center gap-3 border-b border-border/40 px-3 text-sm hover:bg-muted/40',
                  headerCols,
                  row.index < 3 ? 'font-semibold' : '',
                )}
                style={{
                  transform: `translateY(${row.start}px)`,
                  height: row.size,
                }}
              >
                <div className="text-right text-muted-foreground">
                  {row.index + 1}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/direcciones/${fila.direccion}`}
                    className="truncate font-mono text-xs text-primary hover:underline"
                    title={fila.direccion}
                  >
                    {shortAddress(fila.direccion)}
                  </Link>
                  {nombre && (
                    <span className="truncate rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                      {nombre}
                    </span>
                  )}
                  <a
                    href={`https://hypurrscan.io/address/${fila.direccion}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Abrir en Hypurrscan"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div
                  className={cn(
                    'truncate text-right',
                    lado === 'BUY' ? 'text-buy' : 'text-sell',
                  )}
                  title={String(vol)}
                >
                  {formatUsd(vol)}
                </div>
                <div
                  className="truncate text-right text-muted-foreground"
                  title={disponible == null ? '—' : String(disponible)}
                >
                  {disponible == null
                    ? '—'
                    : lado === 'BUY'
                      ? formatUsdCompact(disponible)
                      : `${formatTokenAmount(disponible)} ${tokenSymbol}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
