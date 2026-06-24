import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import EntidadForm from '@/features/catalogo/EntidadForm';
import { api, type Entidad } from '@/core/api';

interface Pagina {
  items: Entidad[];
  total: number;
  page: number;
  size: number;
}

export default function EntidadesPage() {
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['entidades', q],
    queryFn: () =>
      api.get<Pagina>(`/api/entidades${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 10_000,
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/entidades/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entidades'] });
      toast.success('Entidad eliminada');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Entidades</CardTitle>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nueva entidad
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nombre"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )}
        {query.data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay entidades. Crea la primera para empezar a resolver direcciones en el leaderboard.
          </p>
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {query.data?.items.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/entidades/${e.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {e.nombre}
                </Link>
                <div className="text-xs text-muted-foreground">
                  Creada {new Date(e.creadaEn).toLocaleDateString()}
                </div>
              </div>
              <Badge variant="secondary">
                {e.numDirecciones} {e.numDirecciones === 1 ? 'dirección' : 'direcciones'}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm(`¿Eliminar "${e.nombre}" y sus direcciones?`))
                    delMutation.mutate(e.id);
                }}
                title="Eliminar entidad"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
      {showForm && (
        <EntidadForm open={showForm} onOpenChange={setShowForm} />
      )}
    </Card>
  );
}
