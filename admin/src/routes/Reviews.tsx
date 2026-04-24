import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { listReviews, toggleHidden, type Review } from '@/api/reviews';
import { listCities } from '@/api/cities';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Reviews() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: cities } = useQuery({ queryKey: ['cities'], queryFn: () => listCities(), staleTime: 60_000 });

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', city, source, showHidden, page],
    queryFn: () => listReviews({
      city: city || undefined,
      source: source || undefined,
      hidden: showHidden ? 'all' : 'false',
      page,
      page_size: pageSize,
    }),
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_hidden }: { id: string; is_hidden: boolean }) => toggleHidden(id, is_hidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast({ title: 'Обновлено' });
    },
    onError: () => toast({ title: 'Ошибка', variant: 'destructive' }),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Отзывы</h2>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-48">
          <Select value={city} onValueChange={(v) => { setCity(v === '__all__' ? '' : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Город" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все города</SelectItem>
              {cities?.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={source} onValueChange={(v) => { setSource(v === '__all__' ? '' : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Источник" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все</SelectItem>
              <SelectItem value="2gis">2ГИС</SelectItem>
              <SelectItem value="yandex">Яндекс</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showHidden} onCheckedChange={(v) => { setShowHidden(v); setPage(1); }} />
          <Label className="text-sm">Показывать скрытые</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-2">
          {data?.reviews.map((review) => (
            <ReviewRow key={review.id} review={review} onToggle={(hidden) => toggleMut.mutate({ id: review.id, is_hidden: hidden })} />
          ))}
          {data?.reviews.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">Нет отзывов</p>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" />Назад
          </Button>
          <span className="text-sm text-muted-foreground">Стр {page} из {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Вперёд<ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ review, onToggle }: { review: Review; onToggle: (hidden: boolean) => void }) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const sourceName = review.source === '2gis' ? '2ГИС' : 'Яндекс';

  return (
    <div className={cn('rounded-md border p-4', review.is_hidden && 'opacity-50')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{review.author}</span>
            <Badge variant="outline" className="text-xs">{sourceName}</Badge>
            <span className="text-amber-500">{stars}</span>
            <span className="text-muted-foreground">{formatDate(review.published_at)}</span>
            {review.is_hidden && <Badge variant="destructive" className="text-xs">СКРЫТ</Badge>}
          </div>
          <p className="mt-1 text-sm leading-relaxed">{review.text}</p>
          {review.reply && (
            <div className="mt-2 rounded bg-muted/50 p-2 text-sm">
              <span className="font-medium">Ответ:</span> {review.reply}
            </div>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              {review.is_hidden ? <><Eye className="mr-1 h-3 w-3" />Показать</> : <><EyeOff className="mr-1 h-3 w-3" />Скрыть</>}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{review.is_hidden ? 'Показать отзыв?' : 'Скрыть отзыв?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {review.is_hidden
                  ? 'Отзыв снова будет виден в виджете на сайте.'
                  : 'Отзыв будет скрыт из виджета на сайте.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={() => onToggle(!review.is_hidden)}>
                {review.is_hidden ? 'Показать' : 'Скрыть'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
