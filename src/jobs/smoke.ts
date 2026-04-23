import { prisma } from '../lib/prisma.js';
import { fetchTwoGisReviews } from '../sources/twogis.js';
import { fetchYandexReviews } from '../sources/yandex.js';
import { createAlert } from '../lib/alerts.js';
import type { RawReview } from '../sources/types.js';

interface SmokeResult {
  source: '2gis' | 'yandex';
  ok: boolean;
  count: number;
  error?: string;
}

const SOURCE_LABEL: Record<string, string> = { '2gis': '2ГИС', yandex: 'Яндекс.Карты' };

function validateReview(r: RawReview): string | null {
  if (!r.author || r.author.trim() === '') return 'пустое поле "автор"';
  if (!r.text || r.text.trim() === '') return 'пустой текст отзыва';
  if (typeof r.rating !== 'number' || r.rating < 1 || r.rating > 5) return `некорректный рейтинг: ${r.rating}`;
  if (!r.externalId) return 'отсутствует externalId';
  return null;
}

async function runOne(
  source: '2gis' | 'yandex',
  fn: () => Promise<{ reviews: RawReview[] }>,
): Promise<SmokeResult> {
  try {
    const result = await fn();
    if (!result.reviews || result.reviews.length === 0) {
      return { source, ok: false, count: 0, error: 'скрапер вернул 0 отзывов' };
    }
    for (const r of result.reviews.slice(0, 3)) {
      const err = validateReview(r);
      if (err) return { source, ok: false, count: result.reviews.length, error: `некорректная структура отзыва: ${err}` };
    }
    return { source, ok: true, count: result.reviews.length };
  } catch (err) {
    return { source, ok: false, count: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runSmokeTest(): Promise<SmokeResult[]> {
  const city = await prisma.city.findFirst({
    where: {
      isActive: true,
      twogisFirmId: { not: null },
      yandexOrgId: { not: null },
    },
    orderBy: { id: 'asc' },
  });

  if (!city) {
    console.log('[Smoke] no active city with both sources — skipping');
    return [];
  }

  console.log(`[Smoke] testing against city "${city.slug}"`);

  const results: SmokeResult[] = [];
  if (city.twogisFirmId) {
    results.push(await runOne('2gis', () => fetchTwoGisReviews(city.twogisFirmId!)));
  }
  if (city.yandexOrgId) {
    results.push(await runOne('yandex', () => fetchYandexReviews(city.yandexOrgId!)));
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    const sourceList = failed.map(f => SOURCE_LABEL[f.source] ?? f.source).join(', ');
    const details = failed
      .map(r => `• ${SOURCE_LABEL[r.source] ?? r.source}: ${r.error}`)
      .join('\n');

    await createAlert({
      level: 'error',
      title: `Ежедневный тест скрапинга упал: ${sourceList}`,
      message:
        `Ежедневный smoke-test запускается в 02:00, до основного обновления в 03:00 — чтобы успеть починить до того, как плохие данные уйдут в БД.\n\n` +
        `Результат теста для города «${city.name}»:\n${details}\n\n` +
        `Что делать:\n` +
        `• Если "0 отзывов" или "некорректная структура" — скорее всего, на сайте источника поменялись CSS-классы. Откройте страницу вручную и сравните с селекторами в коде (src/sources/<source>.ts).\n` +
        `• Если другая ошибка — это технический сбой (сеть, браузер, API-лимит). Можно подождать и проверить при следующем обновлении.\n\n` +
        `После правки — через админку, раздел «Города», кнопка «Обновить» рядом с городом.`,
      dedupeKey: `smoke:${failed.map(f => f.source).sort().join(',')}`,
      dedupeMs: 12 * 3600_000,
      context: { citySlug: city.slug, failed },
    });
  } else {
    console.log('[Smoke] all sources OK:', results.map(r => `${r.source}=${r.count}`).join(', '));
  }

  return results;
}
