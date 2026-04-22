import { prisma } from '../lib/prisma.js';
import { memoryCache } from './memory.js';
import type { RawReview } from '../sources/types.js';
import crypto from 'crypto';

const YANDEX_AVATAR_HOSTS = ['avatars.mds.yandex.net', 'avatars.yandex.net', 'yastat.net'];

function proxyAvatarUrl(url: string | null, source: string): string | null {
  if (!url || source !== 'yandex') return url;
  try {
    const parsed = new URL(url);
    if (YANDEX_AVATAR_HOSTS.includes(parsed.hostname)) {
      return `/api/proxy/img?url=${encodeURIComponent(url)}`;
    }
  } catch { /* ignore */ }
  return url;
}

export async function upsertReviews(cityId: number, source: string, reviews: RawReview[]) {
  const now = new Date();
  for (const review of reviews) {
    const id = crypto.createHash('sha256').update(`${source}:${review.externalId}`).digest('hex');

    await prisma.review.upsert({
      where: { id },
      create: {
        id,
        source,
        externalId: review.externalId,
        cityId,
        author: review.author,
        avatarUrl: review.avatarUrl,
        rating: review.rating,
        text: review.text,
        reply: review.reply,
        reviewUrl: review.reviewUrl,
        publishedAt: new Date(review.publishedAt),
        fetchedAt: now,
        lastSeenAt: now,
      },
      update: {
        text: review.text,
        reply: review.reply,
        rating: review.rating,
        avatarUrl: review.avatarUrl,
        fetchedAt: now,
        lastSeenAt: now,
      },
    });
  }
}

export async function updateSourceStatus(
  cityId: number,
  source: string,
  success: boolean,
  error: string | null,
  reviewsCount: number,
  averageRating: number | null,
) {
  await prisma.sourceStatus.upsert({
    where: { cityId_source: { cityId, source } },
    create: {
      cityId,
      source,
      lastSuccessAt: success ? new Date() : null,
      lastErrorAt: success ? null : new Date(),
      lastError: error,
      reviewsCount,
      averageRating,
    },
    update: {
      ...(success
        ? { lastSuccessAt: new Date(), reviewsCount, averageRating }
        : { lastErrorAt: new Date(), lastError: error }),
    },
  });
}

export interface ReviewsQuery {
  citySlug: string;
  source?: string;
  limit?: number;
}

export interface ReviewsResult {
  reviews: Array<{
    id: string;
    source: string;
    author: string;
    avatar: string | null;
    rating: number;
    text: string;
    date: string;
    reply: string | null;
    review_url: string | null;
  }>;
  stats: {
    total: number;
    average: number;
    by_source: Record<string, { count: number; average: number }>;
  };
  updated_at: string | null;
}

export async function getPublicReviews(query: ReviewsQuery): Promise<ReviewsResult> {
  const cacheKey = `reviews:${query.citySlug}:${query.source || 'all'}:${query.limit || 50}`;
  const cached = memoryCache.get<ReviewsResult>(cacheKey);
  if (cached) return cached;

  const city = await prisma.city.findUnique({ where: { slug: query.citySlug } });
  if (!city) {
    return { reviews: [], stats: { total: 0, average: 0, by_source: {} }, updated_at: null };
  }

  const where: Record<string, unknown> = {
    cityId: city.id,
    isHidden: false,
  };
  if (query.source) {
    where.source = query.source;
  }

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: query.limit || 50,
  });

  // Get stats from source_status
  const statuses = await prisma.sourceStatus.findMany({
    where: { cityId: city.id },
  });

  const bySource: Record<string, { count: number; average: number }> = {};
  let totalCount = 0;
  let weightedSum = 0;

  for (const s of statuses) {
    bySource[s.source] = {
      count: s.reviewsCount,
      average: s.averageRating ? Math.round(s.averageRating * 10) / 10 : 0,
    };
    totalCount += s.reviewsCount;
    if (s.averageRating) {
      weightedSum += s.averageRating * s.reviewsCount;
    }
  }

  const overallAverage = totalCount > 0 ? Math.round((weightedSum / totalCount) * 10) / 10 : 0;

  const lastUpdate = statuses
    .map(s => s.lastSuccessAt)
    .filter(Boolean)
    .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0];

  const result: ReviewsResult = {
    reviews: reviews.map(r => ({
      id: r.id,
      source: r.source,
      author: r.author,
      avatar: proxyAvatarUrl(r.avatarUrl, r.source),
      rating: r.rating,
      text: r.text,
      date: r.publishedAt.toISOString(),
      reply: r.reply,
      review_url: r.reviewUrl,
    })),
    stats: {
      total: totalCount,
      average: overallAverage,
      by_source: bySource,
    },
    updated_at: lastUpdate?.toISOString() ?? null,
  };

  memoryCache.set(cacheKey, result);
  return result;
}
