import { prisma } from '../lib/prisma.js';
import { notify } from '../lib/notifier.js';

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
    await notify(
      `🧹 <b>Retention cleanup</b>\nDeleted ${totalDeleted} stale reviews (not seen &gt; ${STALE_DAYS}d).`,
      { key: 'retention:large-cleanup', dedupeMs: 24 * 3600_000 },
    );
  }

  return totalDeleted;
}
