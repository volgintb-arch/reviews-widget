import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { listCities, deleteCity, updateCity, type City } from '@/api/cities';

export default function Cities() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cities, isLoading } = useQuery({ queryKey: ['cities'], queryFn: listCities, staleTime: 30_000 });

  const deleteMut = useMutation({
    mutationFn: (slug: string) => deleteCity(slug),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cities'] }); toast({ title: 'Город удалён' }); },
    onError: () => toast({ title: 'Ошибка удаления', variant: 'destructive' }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ slug, is_active }: { slug: string; is_active: boolean }) => updateCity(slug, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cities'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Города</h2>
        <Button asChild>
          <Link to="/cities/new"><Plus className="mr-2 h-4 w-4" />Добавить город</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Slug</th>
                <th className="p-3 text-left font-medium">Название</th>
                <th className="p-3 text-center font-medium">2ГИС</th>
                <th className="p-3 text-center font-medium">Яндекс</th>
                <th className="p-3 text-center font-medium">Активен</th>
                <th className="p-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {cities?.map((city) => (
                <CityRow
                  key={city.id}
                  city={city}
                  onToggle={(active) => toggleMut.mutate({ slug: city.slug, is_active: active })}
                  onDelete={() => deleteMut.mutate(city.slug)}
                />
              ))}
              {cities?.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Нет городов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CityRow({ city, onToggle, onDelete }: { city: City; onToggle: (v: boolean) => void; onDelete: () => void }) {
  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="p-3 font-mono">{city.slug}</td>
      <td className="p-3">{city.name}</td>
      <td className="p-3 text-center">{city.twogis_firm_id ? <Check className="mx-auto h-4 w-4 text-green-600" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
      <td className="p-3 text-center">{city.yandex_org_id ? <Check className="mx-auto h-4 w-4 text-green-600" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}</td>
      <td className="p-3 text-center">
        <Switch checked={city.is_active} onCheckedChange={onToggle} />
      </td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/cities/${city.slug}/edit`}><Pencil className="h-4 w-4" /></Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить город {city.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Это удалит все {city.reviews_count ?? 0} отзывов этого города. Действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
