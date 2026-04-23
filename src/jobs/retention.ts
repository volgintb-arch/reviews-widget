import { prisma } from '../lib/prisma.js';
import { createAlert } from '../lib/alerts.js';

const STALE_DAYS = 60;
const HEALTHY_LAST_SUCCESS_DAYS = 7;

// Delete reviews not seen for STALE_DAYS, but only for (cityId, source) pairs
// whose scraper succeeded in the last HEALTHY_LAST_SUCCESS_DAYS. If the scraper
// is broken (selectors changed, rate-limited, etc.) we must NOT prune — the
// missing reviews are likely due to broken fetches, not real deletions.
export async function cleanupStaleReviews(): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_DAYS * 86400_000);
  const healthyThreshold = new Date(Date.now() - HEALTHY_LAST_SUCCESS_DAYS * 86400_000);

  const healthySources = await prisma.sourceStatus.findMany({
    where: { lastSuccessAt: { gte: healthyThreshold } },
    select: { cityId: true, source: true },
  });

  if (healthySources.length === 0) {
    console.log('[Retention] no healthy sources — skipping cleanup');
    return 0;
  }

  let totalDeleted = 0;
  for (const { cityId, source } of healthySources) {
    const result = await prisma.review.deleteMany({
      where: {
        cityId,
        source,
        lastSeenAt: { lt: staleThreshold },
      },
    });
    if (result.count > 0) {
      console.log(`[Retention] deleted ${result.count} stale ${source} reviews for city ${cityId}`);
      totalDeleted += result.count;
    }
  }

  console.log(`[Retention] total deleted: ${totalDeleted}`);

  if (totalDeleted >= 50) {
    await createAlert({
      level: 'info',
      title: `Удалено много старых отзывов (${totalDeleted} шт.)`,
      message:
        `В ходе ежедневной чистки удалено ${totalDeleted} отзывов, которые не появлялись на сайте источника больше ${STALE_DAYS} дней.\n\n` +
        `Обычно удаляются 0-10 отзывов за раз. Если сразу ушло много — возможно, источник массово скрыл или удалил часть отзывов. ` +
        `Это нормально, но стоит проверить:\n` +
        `• Не падал ли скрапер в последнюю неделю (откройте список городов).\n` +
        `• Не изменилась ли структура сайта (откройте страницу города в 2ГИС/Яндексе).\n\n` +
        `Если всё выглядит штатно — просто пометьте этот алерт как прочитанный.`,
      dedupeKey: 'retention:large-cleanup',
      dedupeMs: 24 * 3600_000,
      context: { deleted: totalDeleted },
    });
  }

  return totalDeleted;
}
