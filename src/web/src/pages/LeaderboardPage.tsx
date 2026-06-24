import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LeaderboardFilters from '@/features/leaderboard/LeaderboardFilters';
import LeaderboardTable from '@/features/leaderboard/LeaderboardTable';
import PriceTicker from '@/features/leaderboard/PriceTicker';
import LightweightChart from '@/features/leaderboard/LightweightChart';
import { useAppData } from '@/core/AppDataContext';
import { formatUsd, formatUsdFine, relativeTime } from '@/core/format';
import { LADO_SHORT, resolveMidPrice, volumenPorLado } from '@/core/domain';
import type { Temporalidad } from '@/core/api';

const VENTANA_SEG: Record<Temporalidad, number> = {
  '1h': 3600,
  '4h': 14_400,
  '6h': 21_600,
  '12h': 43_200,
  '1d': 86_400,
  '1w': 604_800,
};

/**
 * Leaderboard: layout fijo (gráfico HL + tabla). Catálogo y WS precargados
 * en AppDataProvider — cambiar mercado/token es instantáneo.
 */
export default function LeaderboardPage() {
  const { selection, stream, getTokenMeta } = useAppData();
  const { mercado, token, temporalidad, lado } = selection;

  const tokenMeta = useMemo(
    () => (token ? getTokenMeta(mercado, token) : undefined),
    [getTokenMeta, mercado, token],
  );

  const totalVolumen = useMemo(
    () => stream.filas.reduce((a, f) => a + volumenPorLado(f, lado), 0),
    [stream.filas, lado],
  );

  const precioToken = token
    ? resolveMidPrice(stream.mids, token, tokenMeta)
    : undefined;

  const coverage = useCoverage(mercado, token, temporalidad);

  return (
    <div className="space-y-4">
      <PriceTicker
        mids={stream.mids}
        wsStatus={stream.status}
        highlights={
          ['HYPE.p', 'BTC.p', 'ETH.p', 'SOL.p', token].filter(Boolean) as string[]
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Leaderboard
              <Badge
                variant={
                  stream.status === 'open'
                    ? 'success'
                    : stream.status === 'connecting'
                      ? 'warning'
                      : 'outline'
                }
              >
                {stream.status === 'open' ? 'En vivo' : stream.status}
              </Badge>
              {stream.lastUpdateTs && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {relativeTime(stream.lastUpdateTs)}
                </span>
              )}
            </CardTitle>
            {stream.errorMessage && (
              <p className="mt-1 text-xs text-destructive">{stream.errorMessage}</p>
            )}
          </div>
          {precioToken !== undefined && (
            <div className="text-right tabular-nums">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {token}
              </div>
              <div className="text-2xl font-semibold">
                {formatUsdFine(precioToken)}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <LeaderboardFilters />

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <LightweightChart
              mercado={mercado}
              token={token}
              temporalidad={temporalidad}
            />
            <div className="flex h-[520px] min-h-0 flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Direcciones" value={stream.filas.length} />
                <Stat
                  label={`Vol. ${LADO_SHORT[lado].toLowerCase()}`}
                  value={formatUsd(totalVolumen)}
                  tone={lado === 'BUY' ? 'buy' : 'sell'}
                />
              </div>
              <CoverageBar
                temporalidad={temporalidad}
                elapsedSec={coverage.elapsedSec}
                windowSec={coverage.windowSec}
              />
              <LeaderboardTable
                filas={stream.filas}
                lado={lado}
                mercado={mercado}
                token={token}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Cobertura: tiempo que llevamos suscritos a (mercado, token, temporalidad).
 * Cuando llega a `windowSec`, la ventana del leaderboard está completamente
 * "llenada" en vivo. Se resetea al cambiar cualquiera de los tres.
 */
function useCoverage(
  mercado: string,
  token: string,
  temporalidad: Temporalidad,
): { elapsedSec: number; windowSec: number } {
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const windowSec = VENTANA_SEG[temporalidad];

  useEffect(() => {
    setStartedAt(Date.now());
    setNow(Date.now());
  }, [mercado, token, temporalidad]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  return { elapsedSec: Math.min(elapsedSec, windowSec), windowSec };
}

function CoverageBar({
  temporalidad,
  elapsedSec,
  windowSec,
}: {
  temporalidad: Temporalidad;
  elapsedSec: number;
  windowSec: number;
}) {
  const pct = Math.min(100, (elapsedSec / windowSec) * 100);
  const complete = elapsedSec >= windowSec;
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Cobertura de ventana ({temporalidad})</span>
        <span className="tabular-nums">
          {complete
            ? 'Completa'
            : `${formatDuration(elapsedSec)} / ${formatDuration(windowSec)}`}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-border/60">
        <div
          className={
            complete
              ? 'absolute inset-y-0 left-0 bg-success transition-[width] duration-700 ease-out'
              : 'absolute inset-y-0 left-0 bg-primary transition-[width] duration-700 ease-out'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'buy' | 'sell';
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          tone === 'buy' ? 'text-buy' : tone === 'sell' ? 'text-sell' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
