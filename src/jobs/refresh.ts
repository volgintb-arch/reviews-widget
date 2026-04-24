import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { fetchTwoGisReviews } from '../sources/twogis.js';
import { fetchYandexReviews } from '../sources/yandex.js';
import { upsertReviews, updateSourceStatus } from '../cache/repository.js';
import { memoryCache } from '../cache/memory.js';
import { createAlert } from '../lib/alerts.js';
import { cleanupStaleReviews } from './retention.js';
import { runSmokeTest } from './smoke.js';

const SOURCE_LABEL: Record<string, string> = { '2gis': '2ГИС', yandex: 'Яндекс.Карты' };

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
  const city = await prisma.city.findFirst({ where: { slug } });
  if (!city) throw new Error(`City "${slug}" not found`);
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
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { slug: true, name: true } });
  const cityName = city?.name ?? `город #${cityId}`;
  const citySlug = city?.slug ?? `#${cityId}`;
  const srcLabel = SOURCE_LABEL[source] ?? source;

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
      const externalId = source === '2gis' ? firmId : orgId;
      const sourceUrl = source === '2gis'
        ? `https://2gis.ru/firm/${externalId}`
        : `https://yandex.ru/maps/org/${externalId}/reviews/`;
      await createAlert({
        level: 'warning',
        title: `${srcLabel} не вернул отзывов — город «${cityName}»`,
        message:
          `Скрапер ${srcLabel} отработал, но не нашёл ни одного отзыва. Это необычно — обычно причина одна из двух:\n\n` +
          `1. На сайте источника поменялись CSS-классы, по которым ищутся отзывы. Тогда нужно обновить селекторы в коде (src/sources/${source}.ts).\n` +
          `2. Заведение временно скрыло отзывы или их действительно нет.\n\n` +
          `Что проверить: откройте вручную ${sourceUrl} — если отзывы на странице есть, значит сломались селекторы, нужна правка кода.`,
        dedupeKey: `zero:${cityId}:${source}`,
        context: { cityId, citySlug, source, sourceUrl },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Refresh] ${source} for city ${cityId} failed:`, message);
    await updateSourceStatus(cityId, source, false, message, 0, null);

    const hints = source === '2gis'
      ? `• Проверьте TWOGIS_PUBLIC_KEY в .env — возможно, ключ истёк или был отозван.\n` +
        `• Возможно, превышен лимит запросов — подождите час и попробуйте снова.\n` +
        `• Если ошибка повторяется после смены ключа, возможно, изменилось API 2ГИС — нужна правка кода.`
      : `• Возможно, Playwright не смог запустить браузер на сервере (проверьте, установлен ли Chromium).\n` +
        `• Яндекс может временно блокировать IP сервера — подождите 30-60 минут.\n` +
        `• Если ошибка «Playwright got 0 reviews — check /tmp/yandex-debug.html» — сломались селекторы, нужна правка кода.`;

    await createAlert({
      level: 'error',
      title: `${srcLabel} упал с ошибкой — город «${cityName}»`,
      message:
        `Скрапер ${srcLabel} завершился с ошибкой:\n\n${message}\n\n` +
        `Возможные причины:\n${hints}`,
      dedupeKey: `error:${cityId}:${source}`,
      context: { cityId, citySlug, source, error: message },
    });
  }
}
