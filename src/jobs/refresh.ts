import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { fetchTwoGisReviews } from '../sources/twogis.js';
import { fetchYandexReviews } from '../sources/yandex.js';
import { upsertReviews, updateSourceStatus } from '../cache/repository.js';
import { memoryCache } from '../cache/memory.js';

export function setupCron() {
  // 03:00, 09:00, 15:00, 21:00
  cron.schedule('0 3,9,15,21 * * *', async () => {
    console.log('[Cron] Starting refreshAll');
    await refreshAll();
    console.log('[Cron] Completed refreshAll');
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Refresh] ${source} for city ${cityId} failed:`, message);
    await updateSourceStatus(cityId, source, false, message, 0, null);
  }
}
