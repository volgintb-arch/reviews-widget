import { config } from '../config.js';
import type { RawReview, SourceResult } from './types.js';

const MAX_REVIEWS = 500;
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

interface TwoGisReview {
  id: string;
  rating: number;
  text?: string;
  date_created: string;
  user?: {
    name?: string;
    photo_preview_urls?: { url?: string };
  };
  official_answer?: {
    text?: string;
  };
}

interface TwoGisResponse {
  reviews?: TwoGisReview[];
  meta?: {
    branch_rating?: number;
    branch_reviews_count?: number;
    total_count?: number;
  };
}

export async function fetchTwoGisReviews(firmId: string): Promise<SourceResult> {
  const allReviews: RawReview[] = [];
  let averageRating: number | null = null;
  let totalCount = 0;
  let offset = 0;

  while (offset < MAX_REVIEWS) {
    const url = new URL(`${config.TWOGIS_API_BASE}/branches/${firmId}/reviews`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (offset > 0) url.searchParams.set('offset', String(offset));
    url.searchParams.set('fields', 'meta.branch_rating,meta.branch_reviews_count,meta.total_count');
    url.searchParams.set('sort_by', 'date_created');
    url.searchParams.set('key', config.TWOGIS_PUBLIC_KEY);
    url.searchParams.set('locale', 'ru_RU');

    const data = await fetchWithRetry(url.toString());

    if (offset === 0 && data.meta) {
      averageRating = data.meta.branch_rating ?? null;
      totalCount = data.meta.total_count ?? data.meta.branch_reviews_count ?? 0;
    }

    const reviews = data.reviews ?? [];
    for (const r of reviews) {
      allReviews.push(mapTwoGisReview(r, firmId));
    }

    if (reviews.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { reviews: allReviews, averageRating, totalCount };
}

function mapTwoGisReview(r: TwoGisReview, firmId: string): RawReview {
  return {
    externalId: r.id,
    source: '2gis',
    author: r.user?.name ?? 'Аноним',
    avatarUrl: r.user?.photo_preview_urls?.url ?? null,
    rating: r.rating,
    text: r.text ?? '',
    reply: r.official_answer?.text ?? null,
    publishedAt: r.date_created,
    reviewUrl: `https://2gis.ru/search/firm/${firmId}/tab/reviews/?reviewId=${r.id}`,
  };
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<TwoGisResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; QuestLegendsBot/1.0)',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://2gis.ru/',
        },
      });

      if (response.status === 429) {
        const delay = attempt === 1 ? 60000 : 60000 * attempt;
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`2GIS API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as TwoGisResponse;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(10000 * attempt);
    }
  }
  throw new Error('2GIS fetch failed after retries');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
export { mapTwoGisReview };
