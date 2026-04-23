import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CircleAlert, Info, Check, Trash2, CheckCheck, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { listAlerts, ackAlert, ackAllAlerts, deleteAlert, type Alert, type AlertLevel } from '@/api/alerts';

const LEVEL_META: Record<AlertLevel, { icon: typeof Info; color: string; label: string }> = {
  info:    { icon: Info,           color: 'text-blue-600',   label: 'Инфо' },
  warning: { icon: AlertTriangle,  color: 'text-amber-600',  label: 'Предупреждение' },
  error:   { icon: CircleAlert,    color: 'text-red-600',    label: 'Ошибка' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Alerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['alerts', filter],
    queryFn: () => listAlerts(filter),
    refetchInterval: 60_000,
  });

  const ackMut = useMutation({
    mutationFn: ackAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
  });

  const ackAllMut = useMutation({
    mutationFn: ackAllAlerts,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
      toast({ title: `Отмечено как прочитано: ${count}` });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
  });

  const unreadCount = alerts?.filter(a => !a.acknowledged_at).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Алерты</h2>
          <p className="text-sm text-muted-foreground">
            Уведомления о проблемах со скрапингом — что нужно проверить или починить
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Обновить
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => ackAllMut.mutate()} disabled={ackAllMut.isPending}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Прочитать все
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Непрочитанные {unreadCount > 0 && <Badge className="ml-2" variant="secondary">{unreadCount}</Badge>}
        </Button>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Все
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !alerts || alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {filter === 'unread' ? 'Нет непрочитанных алертов — всё работает штатно 👌' : 'Алертов пока не было'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onAck={() => ackMut.mutate(alert.id)}
              onDelete={() => deleteMut.mutate(alert.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertItem({
  alert,
  onAck,
  onDelete,
}: {
  alert: Alert;
  onAck: () => void;
  onDelete: () => void;
}) {
  const meta = LEVEL_META[alert.level] ?? LEVEL_META.info;
  const Icon = meta.icon;
  const isRead = !!alert.acknowledged_at;

  return (
    <Card className={cn(isRead && 'opacity-60')}>
      <CardContent className="flex gap-3 pt-4">
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', meta.color)} />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{alert.title}</h3>
              <p className="text-xs text-muted-foreground">
                {formatDate(alert.created_at)}
                {isRead && ` · прочитано ${formatDate(alert.acknowledged_at!)}`}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {!isRead && (
                <Button size="sm" variant="ghost" onClick={onAck} title="Пометить прочитанным">
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDelete} title="Удалить">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90">{alert.message}</pre>
        </div>
      </CardContent>
    </Card>
  );
}
