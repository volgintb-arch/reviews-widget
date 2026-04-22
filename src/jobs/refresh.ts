import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { fetchTwoGisReviews } from '../sources/twogis.js';
import { fetchYandexReviews } from '../sources/yandex.js';
import { upsertReviews, updateSourceStatus } from '../cache/repository.js';
import { memoryCache } from '../cache/memory.js';
import { notify } from '../lib/notifier.js';
import { cleanupStaleReviews } from './retention.js';
import { runSmokeTest } from './smoke.js';

export function setupCron() {
  // Refresh: 03:00, 09:00, 15:00, 21:00
  cron.schedule('0 3,9,15,21 * * *', async () => {
    console.log('[Cron] Starting refreshAll');
    await refreshAll();
    console.log('[Cron] Completed refreshAll');
  });

  // Smoke test: 02:00 daily — before the 03:00 refresh so we catch breakage early
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Starting smoke test');
    try {
      await runSmokeTest();
    } catch (err) {
      console.error('[Cron] smoke test crashed:', err);
    }
  });

  // Retention: 04:00 daily — after refresh has updated lastSeenAt
  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Starting retention cleanup');
    try {
      await cleanupStaleReviews();
    } catch (err) {
      console.error('[Cron] retention cleanup crashed:', err);
    }
  });
}

export async function refreshAll() {
  const cities = await prisma.city.findMany({ where: { isActive: true } });
  for (const city of cities) {
    const tasks = [];
    if (city.twogisFirmId) {
      tasks.push(refreshSource('2gis', city.id, city.twogisFirmId, null));
    }
    if (city.yandexOrgId) {
      tasks.push(refreshSource('yandex', city.id, null, city.yandexOrgId));
    }
    await Promise.allSettled(tasks);
  }
  memoryCache.flushAll();
}

export async function refreshCity(slug: string) {
  const city = await prisma.city.findUniqueOrThrow({ where: { slug } });
  const tasks = [];
  if (city.twogisFirmId) {
    tasks.push(refreshSource('2gis', city.id, city.twogisFirmId, null));
  }
  if (city.yandexOrgId) {
    tasks.push(refreshSource('yandex', city.id, null, city.yandexOrgId));
  }
  await Promise.allSettled(tasks);
  memoryCache.flushAll();
}

async function refreshSource(
  source: '2gis' | 'yandex',
  cityId: number,
  firmId: string | null,
  orgId: string | null,
) {
  const citySlug = await prisma.city.findUnique({ where: { id: cityId }, select: { slug: true } })
    .then(c => c?.slug ?? `#${cityId}`);

  try {
    const result = source === '2gis'
      ? await fetchTwoGisReviews(firmId!)
      : await fetchYandexReviews(orgId!);

    await upsertReviews(cityId, source, result.reviews);
    await updateSourceStatus(
      cityId, source, true, null,
      result.totalCount, result.averageRating,
    );

    console.log(`[Refresh] ${source} for city ${cityId}: ${result.reviews.length} reviews`);

    if (result.reviews.length === 0) {
      await notify(
        `⚠️ <b>${source}</b> вернул 0 отзывов для города <code>${citySlug}</code>. Возможно, селекторы сломались.`,
        { key: `zero:${cityId}:${source}` },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Refresh] ${source} for city ${cityId} failed:`, message);
    await updateSourceStatus(cityId, source, false, message, 0, null);
    await notify(
      `❌ <b>${source}</b> упал для города <code>${citySlug}</code>:\n<code>${escapeHtml(message)}</code>`,
      { key: `error:${cityId}:${source}` },
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
