import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { useAppData } from '@/core/AppDataContext';
import { TEMPORALIDAD_CHART, resolveMidPrice } from '@/core/domain';
import type { HlChartInterval } from '@/core/domain';
import { formatUsdFine } from '@/core/format';
import type { Mercado, Temporalidad } from '@/core/api';

interface Props {
  mercado: Mercado;
  token: string;
  temporalidad: Temporalidad;
  className?: string;
}

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

interface RawCandle {
  t: number; // open time (ms)
  T: number; // close time (ms)
  s: string; // symbol (feedCoin)
  i: string; // interval
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
}

interface BarData {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Gráfico con `lightweight-charts` + datafeed directo a Hyperliquid.
 *   - Histórico vía `POST /info {type:'candleSnapshot'}`.
 *   - Live vía `wss://api.hyperliquid.xyz/ws` canal `candle`.
 *   - Velas + histograma de volumen, crosshair magnético y tema HL.
 */
export default function LightweightChart({
  mercado,
  token,
  temporalidad,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const { getTokenMeta, stream } = useAppData();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const meta = token ? getTokenMeta(mercado, token) : undefined;
  const feedCoin = meta?.feedCoin ?? token;
  const chartParams = TEMPORALIDAD_CHART[temporalidad];

  const precio = token ? resolveMidPrice(stream.mids, token, meta) : undefined;

  // Crear chart una sola vez por contenedor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d0f' },
        textColor: '#9ca3af',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1d24', style: LineStyle.Dotted },
        horzLines: { color: '#1a1d24', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: '#1a1d24',
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: '#1a1d24',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: '#4b5563', width: 1, style: LineStyle.Dashed },
        horzLine: { color: '#4b5563', width: 1, style: LineStyle.Dashed },
      },
      autoSize: true,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volume = chart.addSeries(HistogramSeries, {
      color: '#374151',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart
      .priceScale('vol')
      .applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  const queryKey = useMemo(
    () => `${feedCoin}|${chartParams.interval}|${chartParams.lookbackSec}`,
    [feedCoin, chartParams.interval, chartParams.lookbackSec],
  );

  // Cargar histórico + abrir WS de candles cuando cambia el símbolo o intervalo.
  useEffect(() => {
    if (!feedCoin || !candleRef.current || !volumeRef.current) return;
    let cancelled = false;
    let ws: WebSocket | null = null;

    const run = async (): Promise<void> => {
      setStatus('loading');
      setErrorMsg(null);
      try {
        const endTime = Date.now();
        const startTime = endTime - chartParams.lookbackSec * 1000;
        const res = await fetch(HL_INFO_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin: feedCoin,
              interval: chartParams.interval,
              startTime,
              endTime,
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as RawCandle[];
        if (cancelled) return;
        const bars = normalizeCandles(raw);
        applyBars(candleRef.current!, volumeRef.current!, bars);
        chartRef.current?.timeScale().fitContent();
        setStatus('ready');
        ws = openLiveCandles(feedCoin, chartParams.interval, (bar) => {
          if (cancelled) return;
          candleRef.current?.update({
            time: bar.time as Time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          });
          volumeRef.current?.update({
            time: bar.time as Time,
            value: bar.volume,
            color: bar.close >= bar.open ? '#16a34a55' : '#dc262655',
          });
        });
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Error cargando velas');
      }
    };

    void run();

    return () => {
      cancelled = true;
      try {
        ws?.close(1000, 'cleanup');
      } catch {
        /* ignore */
      }
    };
  }, [queryKey, chartParams.interval, chartParams.lookbackSec, feedCoin]);

  return (
    <div
      className={`flex h-[520px] flex-col overflow-hidden rounded-md border border-border bg-[#0d0d0f] ${className ?? ''}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{token || '—'}</div>
          <div className="truncate text-xs text-muted-foreground">
            {chartParams.interval} · Hyperliquid
          </div>
        </div>
        {precio !== undefined && (
          <div className="text-right tabular-nums">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Mid
            </div>
            <div className="text-lg font-semibold">{formatUsdFine(precio)}</div>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0d0f]/80 text-sm text-muted-foreground">
            Cargando velas…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-destructive">
            {errorMsg}
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

function normalizeCandles(raw: RawCandle[]): BarData[] {
  const seen = new Set<number>();
  const out: BarData[] = [];
  for (const c of raw) {
    const time = Math.floor(c.t / 1000);
    if (seen.has(time)) continue;
    seen.add(time);
    out.push({
      time,
      open: Number(c.o),
      high: Number(c.h),
      low: Number(c.l),
      close: Number(c.c),
      volume: Number(c.v),
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function applyBars(
  candle: ISeriesApi<'Candlestick'>,
  volume: ISeriesApi<'Histogram'>,
  bars: BarData[],
): void {
  const candleData: CandlestickData<Time>[] = bars.map((b) => ({
    time: b.time as Time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  const volumeData: HistogramData<Time>[] = bars.map((b) => ({
    time: b.time as Time,
    value: b.volume,
    color: b.close >= b.open ? '#16a34a55' : '#dc262655',
  }));
  candle.setData(candleData);
  volume.setData(volumeData);
}

function openLiveCandles(
  feedCoin: string,
  interval: HlChartInterval,
  onBar: (bar: BarData) => void,
): WebSocket {
  const ws = new WebSocket(HL_WS_URL);
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'candle', coin: feedCoin, interval },
      }),
    );
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 45_000);
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as {
        channel?: string;
        data?: RawCandle;
      };
      if (data.channel !== 'candle' || !data.data) return;
      const c = data.data;
      if (c.s !== feedCoin || c.i !== interval) return;
      onBar({
        time: Math.floor(c.t / 1000),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
        volume: Number(c.v),
      });
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    if (pingTimer) clearInterval(pingTimer);
  };
  ws.onerror = () => {
    if (pingTimer) clearInterval(pingTimer);
  };

  return ws;
}
