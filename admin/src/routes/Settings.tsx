import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  getProjectSettings, updateProjectSettings,
  type ProjectSettings as ProjectSettingsType,
} from '@/api/projects';
import { useProjectContext } from '@/lib/project-context';

const colorFields: { key: string; label: string }[] = [
  { key: 'widget.accent_color', label: 'Цвет акцента' },
  { key: 'widget.star_color', label: 'Цвет звёзд' },
  { key: 'widget.bg_color', label: 'Цвет фона' },
  { key: 'widget.card_bg', label: 'Цвет фона карточек' },
  { key: 'widget.text_color', label: 'Цвет текста' },
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentSlug, current } = useProjectContext();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['project-settings', currentSlug],
    queryFn: () => getProjectSettings(currentSlug),
    enabled: !!currentSlug,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (settings) {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        flat[k] = typeof v === 'string' ? v : String(v);
      }
      setValues(flat);
    }
  }, [settings]);

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  const saveMut = useMutation({
    mutationFn: () => updateProjectSettings(currentSlug, values as ProjectSettingsType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-settings', currentSlug] });
      toast({ title: 'Сохранено' });
      setSaving(false);
    },
    onError: () => { toast({ title: 'Ошибка сохранения', variant: 'destructive' }); setSaving(false); },
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    saveMut.mutate();
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[600px]" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Настройки виджета</h2>
        <p className="text-sm text-muted-foreground">
          Проект: <span className="font-medium text-foreground">{current?.name}</span>
          {' · '}эти настройки применяются ко всем городам проекта (могут быть переопределены для конкретного города)
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Изменения применятся к виджету в течение 5 минут
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <Card>
          <CardHeader><CardTitle className="text-base">Контент</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Заголовок виджета</Label>
              <Input value={values['widget.title'] ?? ''} onChange={(e) => set('widget.title', e.target.value)} />
              <p className="text-xs text-muted-foreground">Можно оставить пустым, если заголовок уже есть на странице Tilda.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Минимальный рейтинг для показа</Label>
                <Select value={values['widget.min_rating'] ?? '3'} onValueChange={(v) => set('widget.min_rating', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Отзывы с рейтингом ниже не будут показаны.</p>
              </div>
              <div className="space-y-2">
                <Label>Минимальная длина текста</Label>
                <Input type="number" value={values['widget.min_text_length'] ?? '20'} onChange={(e) => set('widget.min_text_length', e.target.value)} />
                <p className="text-xs text-muted-foreground">Слишком короткие отзывы не показываются.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Дизайн</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {colorFields.map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <div className="flex gap-2">
                  <Input value={values[key] ?? ''} onChange={(e) => set(key, e.target.value)} className="flex-1" />
                  <input
                    type="color"
                    value={values[key] || '#000000'}
                    onChange={(e) => set(key, e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border"
                  />
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <Label>Шрифт</Label>
              <Input value={values['widget.font_family'] ?? ''} onChange={(e) => set('widget.font_family', e.target.value)} />
              <p className="text-xs text-muted-foreground">Если оставить inherit — подхватит шрифт страницы Tilda.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Скругление карточек (px)</Label>
                <Input type="number" min="0" max="60" value={values['widget.card_radius'] ?? '18'} onChange={(e) => set('widget.card_radius', e.target.value)} />
                <p className="text-xs text-muted-foreground">0 — прямые углы, 18 — по умолчанию.</p>
              </div>
              <div className="space-y-2">
                <Label>Скругление табов (px)</Label>
                <Input type="number" min="0" max="999" value={values['widget.tab_radius'] ?? '999'} onChange={(e) => set('widget.tab_radius', e.target.value)} />
                <p className="text-xs text-muted-foreground">999 — капсула (pill), 8 — скруглённый прямоугольник.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Карусель</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Карточек на десктопе</Label>
              <Select value={values['widget.cards_visible_desktop'] ?? '3'} onValueChange={(v) => set('widget.cards_visible_desktop', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Карточек на мобильных</Label>
              <Select value={values['widget.cards_visible_mobile'] ?? '1'} onValueChange={(v) => set('widget.cards_visible_mobile', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сохранить
        </Button>
      </form>
    </div>
  );
}
