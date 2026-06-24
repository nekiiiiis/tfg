import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useAppData } from '@/core/AppDataContext';
import {
  MERCADOS,
  TEMPORALIDADES,
  type Temporalidad,
} from '@/core/api';
import {
  groupMetaTokens,
  LEADERBOARD_LADOS,
  LADO_LABEL,
  MERCADO_LABEL,
  type LeaderboardLado,
} from '@/core/domain';
import { cn } from '@/core/cn';

export default function LeaderboardFilters() {
  const { selection, setSelection, catalogs, catalogsReady } = useAppData();
  const { mercado, token, temporalidad, lado } = selection;

  const comboboxGroups = useMemo(
    () => groupMetaTokens(mercado, catalogs[mercado]),
    [mercado, catalogs],
  );

  const totalTokens = catalogs[mercado].length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
        {MERCADOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSelection({ mercado: m })}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              mercado === m
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {MERCADO_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-1">
          <Label htmlFor="lb-token">Token</Label>
          <Combobox
            value={token}
            onValueChange={(v) => setSelection({ token: v })}
            options={comboboxGroups}
            placeholder={
              catalogsReady ? 'Busca un token…' : 'Precargando catálogo…'
            }
            loading={!catalogsReady}
            disabled={!catalogsReady || totalTokens === 0}
          />
          <p className="text-xs text-muted-foreground">
            {totalTokens > 0
              ? `${totalTokens} tokens · ${MERCADO_LABEL[mercado]}`
              : catalogsReady
                ? 'Sin tokens'
                : 'Cargando…'}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="lb-temp">Temporalidad</Label>
          <Select
            value={temporalidad}
            onValueChange={(v) =>
              setSelection({ temporalidad: v as Temporalidad })
            }
          >
            <SelectTrigger id="lb-temp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPORALIDADES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="lb-lado">Ranking</Label>
          <Select
            value={lado}
            onValueChange={(v) =>
              setSelection({ lado: v as LeaderboardLado })
            }
          >
            <SelectTrigger id="lb-lado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEADERBOARD_LADOS.map((l) => (
                <SelectItem key={l} value={l}>
                  {LADO_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
