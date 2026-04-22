import { prisma } from '../lib/prisma.js';
import { fetchTwoGisReviews } from '../sources/twogis.js';
import { fetchYandexReviews } from '../sources/yandex.js';
import { notify } from '../lib/notifier.js';
import type { RawReview } from '../sources/types.js';

interface SmokeResult {
  source: '2gis' | 'yandex';
  ok: boolean;
  count: number;
  error?: string;
}

function validateReview(r: RawReview): string | null {
  if (!r.author || r.author.trim() === '') return 'empty author';
  if (!r.text || r.text.trim() === '') return 'empty text';
  if (typeof r.rating !== 'number' || r.rating < 1 || r.rating > 5) return `bad rating: ${r.rating}`;
  if (!r.externalId) return 'missing externalId';
  return null;
}

async function runOne(
  source: '2gis' | 'yandex',
  fn: () => Promise<{ reviews: RawReview[] }>,
): Promise<SmokeResult> {
  try {
    const result = await fn();
    if (!result.reviews || result.reviews.length === 0) {
      return { source, ok: false, count: 0, error: 'returned 0 reviews' };
    }
    for (const r of result.reviews.slice(0, 3)) {
      const err = validateReview(r);
      if (err) return { source, ok: false, count: result.reviews.length, error: `invalid shape: ${err}` };
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
    const lines = failed.map(r => `• <b>${r.source}</b>: ${r.error}`).join('\n');
    await notify(
      `⚠️ <b>Smoke test failed</b> (city: ${city.slug})\n${lines}\n\nСкрапер, возможно, сломался — проверьте селекторы до следующего cron-прогона.`,
      { key: `smoke:${failed.map(f => f.source).join(',')}`, dedupeMs: 12 * 3600_000 },
    );
  } else {
    console.log('[Smoke] all sources OK:', results.map(r => `${r.source}=${r.count}`).join(', '));
  }

  return results;
}
