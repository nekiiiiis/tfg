import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import EntidadForm from '@/features/catalogo/EntidadForm';
import DireccionForm from '@/features/catalogo/DireccionForm';
import { api, type Direccion, type Entidad } from '@/core/api';
import { shortAddress } from '@/core/format';

export default function EntidadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [showAddDir, setShowAddDir] = useState(false);
  const qc = useQueryClient();

  const entidadQuery = useQuery({
    queryKey: ['entidad', id],
    queryFn: async () => {
      const page = await api.get<{ items: Entidad[] }>(
        `/api/entidades?q=&page=1&size=200`,
      );
      // Sin endpoint singular: filtramos por id en cliente como atajo MVP.
      return page.items.find((e) => e.id === id) ?? null;
    },
    enabled: !!id,
  });

  const dirsQuery = useQuery({
    queryKey: ['direcciones', id],
    queryFn: () => api.get<Direccion[]>(`/api/entidades/${id}/direcciones`),
    enabled: !!id,
  });

  const removeDir = useMutation({
    mutationFn: (direccionId: string) =>
      api.delete(`/api/entidades/${id}/direcciones/${direccionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['direcciones', id] });
      toast.success('Dirección eliminada');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (!id) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/entidades"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Entidades
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>
              {entidadQuery.data?.nombre ?? '(cargando…)'}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {entidadQuery.data
                ? `Creada el ${new Date(entidadQuery.data.creadaEn).toLocaleString()}`
                : '—'}
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Direcciones</CardTitle>
          <Button onClick={() => setShowAddDir(true)}>
            <Plus className="h-4 w-4" />
            Añadir dirección
          </Button>
        </CardHeader>
        <CardContent>
          {dirsQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Esta entidad aún no tiene direcciones asociadas.
            </p>
          )}
          <div className="divide-y divide-border rounded-md border border-border">
            {dirsQuery.data?.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <Link
                  to={`/direcciones/${d.valor}`}
                  className="font-mono text-sm text-primary hover:underline"
                  title={d.valor}
                >
                  {shortAddress(d.valor)}
                </Link>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://hypurrscan.io/address/${d.valor}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Hypurrscan
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar la dirección ${shortAddress(d.valor)}?`))
                        removeDir.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showEdit && entidadQuery.data && (
        <EntidadForm
          entidad={entidadQuery.data}
          open={showEdit}
          onOpenChange={setShowEdit}
        />
      )}
      {showAddDir && (
        <DireccionForm
          entidadId={id}
          open={showAddDir}
          onOpenChange={setShowAddDir}
        />
      )}
    </div>
  );
}
