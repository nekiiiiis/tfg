import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AlertaForm from '@/features/alertas/AlertaForm';
import {
  api,
  ESTADOS_ALERTA,
  type AlertaResumen,
  type EstadoAlerta,
  type Mercado,
} from '@/core/api';
import { MERCADO_LABEL } from '@/core/domain';
import { formatUsdFine, relativeTime } from '@/core/format';

interface Pagina {
  items: AlertaResumen[];
  total: number;
  page: number;
  size: number;
}

const ALL = 'TODAS';

export default function AlertasPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AlertaResumen | undefined>();
  const [estado, setEstado] = useState<EstadoAlerta | typeof ALL>(ALL);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['alertas', estado],
    queryFn: () =>
      api.get<Pagina>(
        `/api/alertas${estado !== ALL ? `?estado=${estado}` : ''}`,
      ),
    refetchInterval: 6_000,
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/api/alertas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas'] });
      toast.success('Alerta eliminada');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Alertas de precio</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoAlerta)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {ESTADOS_ALERTA.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditing(undefined);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva alerta
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay alertas. Crea la primera para empezar a recibir webhooks.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Token</th>
                <th className="text-left">Mercado</th>
                <th className="text-left">Umbral</th>
                <th className="text-left">Webhook</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Último disparo</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data?.items.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 font-mono font-semibold">{a.token}</td>
                  <td>
                    <Badge
                      variant={
                        a.mercado === 'PerpHIP3'
                          ? 'warning'
                          : a.mercado === 'Spot'
                            ? 'secondary'
                            : 'default'
                      }
                    >
                      {MERCADO_LABEL[a.mercado]}
                    </Badge>
                  </td>
                  <td className="tabular-nums">
                    {a.umbralCruce === 'SUBE' ? '≥' : '≤'}{' '}
                    {formatUsdFine(a.umbralValor)}
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">
                    {a.webhookHost}
                  </td>
                  <td>
                    <Badge
                      variant={
                        a.estado === 'OPERATIVA'
                          ? 'success'
                          : a.estado === 'DISPARADA'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {a.estado}
                    </Badge>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {a.ultimoDisparo
                      ? relativeTime(Date.parse(a.ultimoDisparo))
                      : '—'}
                  </td>
                  <td className="space-x-1 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(a);
                        setShowForm(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`¿Eliminar alerta sobre ${a.token}?`))
                          eliminar.mutate(a.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      {showForm && (
        <AlertaForm
          alerta={editing}
          open={showForm}
          onOpenChange={(o) => {
            setShowForm(o);
            if (!o) setEditing(undefined);
          }}
        />
      )}
    </Card>
  );
}
