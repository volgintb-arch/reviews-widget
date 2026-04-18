import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SourceStatusBadge } from '@/components/SourceStatusBadge';
import { useToast } from '@/components/ui/use-toast';
import { listCities, refreshCity, type City } from '@/api/cities';
import { formatRelative, pluralize } from '@/lib/format';

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cities, isLoading } = useQuery({ queryKey: ['cities'], queryFn: listCities, staleTime: 30_000 });

  const refreshMut = useMutation({
    mutationFn: (slug: string) => refreshCity(slug),
    onSuccess: () => {
      toast({ title: 'Запущена выгрузка' });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['cities'] }), 5000);
    },
    onError: () => toast({ title: 'Ошибка запуска выгрузки', variant: 'destructive' }),
  });

  const totalReviews = cities?.reduce((sum, c) => sum + (c.reviews_count ?? 0), 0) ?? 0;
  const activeCities = cities?.filter((c) => c.is_active).length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Городов</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{activeCities}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Отзывов</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totalReviews}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Активных источников</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {cities?.reduce((sum, c) => sum + (c.sources?.length ?? 0), 0) ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Города</h3>
        {cities?.map((city) => <CityCard key={city.id} city={city} onRefresh={() => refreshMut.mutate(city.slug)} isRefreshing={refreshMut.isPending} />)}
      </div>
    </div>
  );
}

function CityCard({ city, onRefresh, isRefreshing }: { city: City; onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">{city.name} <span className="text-sm text-muted-foreground">({city.slug})</span></h4>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Обновить сейчас
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {city.sources?.map((s) => (
            <div key={s.source} className="flex items-center gap-3 text-sm">
              <SourceStatusBadge lastSuccessAt={s.last_success_at} lastErrorAt={s.last_error_at} />
              <span className="font-medium w-16">{s.source === '2gis' ? '2ГИС' : 'Яндекс'}</span>
              <span className="text-muted-foreground">обновлено {formatRelative(s.last_success_at)}</span>
              <span className="text-muted-foreground">{pluralize(s.reviews_count, 'отзыв', 'отзыва', 'отзывов')}</span>
              {s.average_rating && <span className="text-muted-foreground">★ {s.average_rating.toFixed(1)}</span>}
            </div>
          ))}
          {(!city.sources || city.sources.length === 0) && (
            <p className="text-sm text-muted-foreground">Источники не настроены</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
