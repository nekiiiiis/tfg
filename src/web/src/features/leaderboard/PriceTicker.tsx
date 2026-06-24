import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUsdFine } from '@/core/format';
import { cn } from '@/core/cn';
import { api, type TopVolumeResponse } from '@/core/api';
import { buildTickerOrder } from '@/core/domain';

interface Props {
  mids: Record<string, number>;
  limit?: number;
  wsStatus?: 'connecting' | 'open' | 'closed' | 'error';
  highlights?: string[];
}

interface TickItem {
  token: string;
  valor: number;
  delta: 'up' | 'down' | 'flat';
  destacado: boolean;
}

/**
 * Ticker de precios en marquee infinito hacia la izquierda.
 *  - Sin scroll del usuario (`overflow-hidden` + `pointer-events-none`).
 *  - El precio cambia de color (verde/rojo) pero NO altera el layout: cada
 *    item tiene anchos reservados (`min-w-*`, `text-right`), así el cambio
 *    de color no produce reflow ni reflujo del marquee.
 *  - Cuando llega un nuevo precio sólo se anima brevemente el color del
 *    span del valor (clase `flash-up|down`).
 */
export default function PriceTicker({
  mids,
  limit = 40,
  wsStatus,
  highlights = [],
}: Props) {
  const lastRef = useRef<Record<string, number>>({});

  const { data: top } = useQuery({
    queryKey: ['meta-top-volumen', limit],
    queryFn: () =>
      api.get<TopVolumeResponse>(`/api/meta/top-volumen?limit=${limit}`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const items = useMemo<TickItem[]>(() => {
    const orderedIds = buildTickerOrder(mids, top?.tokens, highlights, limit);
    const highlightSet = new Set(highlights);
    const out: TickItem[] = [];
    for (const token of orderedIds) {
      const valor = mids[token]!;
      out.push(
        buildItem(token, valor, lastRef.current, highlightSet.has(token)),
      );
    }
    for (const it of out) lastRef.current[it.token] = it.valor;
    return out;
  }, [mids, top, highlights, limit]);

  // Velocidad del marquee proporcional al número de items para que la
  // sensación de "scroll" sea constante (px/s). 8s por cada 10 items.
  const duration = useMemo(() => Math.max(40, items.length * 2.5), [items.length]);

  if (items.length === 0) {
    const msg =
      wsStatus === 'error'
        ? 'No se ha podido conectar al feed de precios.'
        : wsStatus === 'closed'
          ? 'Conexión cerrada. Reintentando…'
          : 'Conectando con allMids…';
    return (
      <div className="flex h-12 items-center rounded-md border border-border bg-card px-3 text-xs text-muted-foreground">
        {msg}
      </div>
    );
  }

  return (
    <div className="relative h-12 overflow-hidden rounded-md border border-border bg-card">
      <div
        className="marquee-track h-full items-center"
        style={{ ['--marquee-duration' as never]: `${duration}s` }}
      >
        <TickerRow items={items} />
        <TickerRow items={items} ariaHidden />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent" />
    </div>
  );
}

function TickerRow({
  items,
  ariaHidden,
}: {
  items: TickItem[];
  ariaHidden?: boolean;
}) {
  return (
    <ul
      aria-hidden={ariaHidden}
      className="flex h-full select-none items-center gap-7 px-4 text-sm tabular-nums"
    >
      {items.map((it) => (
        <li
          key={`${ariaHidden ? 'b-' : 'a-'}${it.token}`}
          className="flex shrink-0 items-center gap-1"
        >
          <span
            className={cn(
              'font-mono text-[11px] uppercase tracking-wider',
              it.destacado ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {it.token}
          </span>
          <PriceValue value={it.valor} delta={it.delta} />
        </li>
      ))}
    </ul>
  );
}

function PriceValue({
  value,
  delta,
}: {
  value: number;
  delta: TickItem['delta'];
}) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevDelta = useRef<TickItem['delta']>('flat');

  useEffect(() => {
    if (delta !== 'flat' && delta !== prevDelta.current) {
      setFlash(delta);
      const t = setTimeout(() => setFlash(null), 700);
      prevDelta.current = delta;
      return () => clearTimeout(t);
    }
    prevDelta.current = delta;
  }, [delta, value]);

  return (
    <span
      className={cn(
        'inline-block min-w-[4.5rem] text-left font-medium transition-colors duration-300',
        flash === 'up' && 'text-buy',
        flash === 'down' && 'text-sell',
        flash === null && 'text-foreground',
      )}
    >
      {formatUsdFine(value)}
    </span>
  );
}

function buildItem(
  token: string,
  valor: number,
  prevMap: Record<string, number>,
  destacado: boolean,
): TickItem {
  const prev = prevMap[token];
  let delta: TickItem['delta'] = 'flat';
  if (typeof prev === 'number') {
    if (valor > prev) delta = 'up';
    else if (valor < prev) delta = 'down';
  }
  return { token, valor, delta, destacado };
}
