import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getCity, createCity, updateCity, refreshCity } from '@/api/cities';

const citySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Только латиница, цифры, дефис').min(2).max(20),
  name: z.string().min(1, 'Обязательное поле').max(50),
  site_url: z.string().url('Некорректный URL').optional().or(z.literal('')),
  twogis_firm_id: z.string().regex(/^\d+$/, 'Только цифры').optional().or(z.literal('')),
  yandex_org_id: z.string().regex(/^\d+$/, 'Только цифры').optional().or(z.literal('')),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof citySchema>;

export default function CityForm({ mode }: { mode: 'create' | 'edit' }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: city, isLoading } = useQuery({
    queryKey: ['city', slug],
    queryFn: () => getCity(slug!),
    enabled: mode === 'edit' && !!slug,
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(citySchema),
    defaultValues: { slug: '', name: '', site_url: '', twogis_firm_id: '', yandex_org_id: '', is_active: true },
  });

  const isActive = watch('is_active');

  useEffect(() => {
    if (city) {
      reset({
        slug: city.slug,
        name: city.name,
        site_url: city.site_url ?? '',
        twogis_firm_id: city.twogis_firm_id ?? '',
        yandex_org_id: city.yandex_org_id ?? '',
        is_active: city.is_active,
      });
    }
  }, [city, reset]);

  const saveMut = useMutation({
    mutationFn: async (data: FormData) => {
      const body = {
        ...data,
        site_url: data.site_url || null,
        twogis_firm_id: data.twogis_firm_id || null,
        yandex_org_id: data.yandex_org_id || null,
      };
      if (mode === 'create') return createCity(body);
      return updateCity(slug!, body);
    },
    onSuccess: async (_, data) => {
      queryClient.invalidateQueries({ queryKey: ['cities'] });
      toast({ title: 'Город сохранён' });
      if (mode === 'create' && (data.twogis_firm_id || data.yandex_org_id)) {
        try {
          await refreshCity(data.slug);
          toast({ title: 'Запущена первая выгрузка' });
        } catch { /* ignore */ }
      }
      navigate('/cities');
    },
    onError: () => toast({ title: 'Ошибка сохранения', variant: 'destructive' }),
  });

  if (mode === 'edit' && isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/cities"><ArrowLeft className="mr-2 h-4 w-4" />Назад к списку</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'Новый город' : `Редактирование: ${city?.name}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input id="slug" {...register('slug')} disabled={mode === 'edit'} placeholder="omsk" />
              <p className="text-xs text-muted-foreground">Латиница, цифры, дефис. Используется в URL виджета.</p>
              {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input id="name" {...register('name')} placeholder="Омск" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="site_url">URL сайта</Label>
              <Input id="site_url" {...register('site_url')} placeholder="https://omsk.questlegends.ru" />
              {errors.site_url && <p className="text-sm text-destructive">{errors.site_url.message}</p>}
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <h4 className="font-medium">2ГИС</h4>
              <div className="space-y-2">
                <Label htmlFor="twogis_firm_id">Firm ID</Label>
                <Input id="twogis_firm_id" {...register('twogis_firm_id')} placeholder="70000001098486101" />
                <p className="text-xs text-muted-foreground">Откройте карточку компании на 2gis.ru, скопируйте число из URL после /firm/</p>
                {errors.twogis_firm_id && <p className="text-sm text-destructive">{errors.twogis_firm_id.message}</p>}
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <h4 className="font-medium">Яндекс.Карты</h4>
              <div className="space-y-2">
                <Label htmlFor="yandex_org_id">Org ID</Label>
                <Input id="yandex_org_id" {...register('yandex_org_id')} placeholder="43498626415" />
                <p className="text-xs text-muted-foreground">Откройте карточку на yandex.ru/maps, скопируйте длинное число из URL</p>
                {errors.yandex_org_id && <p className="text-sm text-destructive">{errors.yandex_org_id.message}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={(v) => setValue('is_active', v)} />
              <Label>Активен (выгружать отзывы автоматически)</Label>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/cities')}>
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {mode === 'edit' && city && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Код для вставки в Tilda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Вставьте этот код в блок <span className="font-mono">T123</span> (HTML-код) на странице города в Tilda.
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>{getSnippet(city.slug)}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(getSnippet(city.slug));
                setCopied(true);
                toast({ title: 'Скопировано' });
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getSnippet(slug: string): string {
  return `<div id="ql-reviews" data-city="${slug}"></div>
<script src="https://reviews.questlegends.ru/widget/widget.js" defer></script>`;
}
