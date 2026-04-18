import { cn } from '@/lib/utils';

interface Props {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
}

function getColor(lastSuccessAt: string | null, lastErrorAt: string | null): string {
  if (!lastSuccessAt) return 'bg-gray-400';

  const now = Date.now();
  const successAge = now - new Date(lastSuccessAt).getTime();
  const hasRecentError = lastErrorAt && new Date(lastErrorAt) > new Date(lastSuccessAt);

  if (hasRecentError || successAge > 72 * 3600000) return 'bg-red-500';
  if (successAge > 24 * 3600000) return 'bg-yellow-500';
  return 'bg-green-500';
}

export function SourceStatusBadge({ lastSuccessAt, lastErrorAt }: Props) {
  return (
    <span className={cn('inline-block h-2.5 w-2.5 rounded-full', getColor(lastSuccessAt, lastErrorAt))} />
  );
}
