import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { config } from '../config.js';
import type { RawReview, SourceResult } from './types.js';

// Selectors — update here if Yandex changes widget HTML structure
const SELECTORS = {
  comment:  '.comment',
  author:   '[itemprop="name"]',
  avatar:   '.comment__avatar img',
  rating:   '[itemprop="ratingValue"]',
  date:     '[itemprop="datePublished"]',
  text:     '[itemprop="reviewBody"]',
  reply:    '.business-review-comment-content__bubble',
};

export async function fetchYandexReviews(orgId: string): Promise<SourceResult> {
  const url = `${config.YANDEX_WIDGET_BASE}/${orgId}?comments`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Yandex widget error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseYandexHtml(html, orgId);
}

export function parseYandexHtml(html: string, orgId: string): SourceResult {
  const $ = cheerio.load(html);
  const reviews: RawReview[] = [];

  $(SELECTORS.comment).each((_, el) => {
    const $el = $(el);
    const author = $el.find(SELECTORS.author).text().trim() || 'Аноним';
    const avatarUrl = $el.find(SELECTORS.avatar).attr('src') || null;
    const ratingStr = $el.find(SELECTORS.rating).attr('content') || $el.find(SELECTORS.rating).text().trim();
    const rating = parseInt(ratingStr, 10) || 5;
    const dateStr = $el.find(SELECTORS.date).attr('content') || $el.find(SELECTORS.date).text().trim();
    const text = $el.find(SELECTORS.text).text().trim();
    const reply = $el.find(SELECTORS.reply).text().trim() || null;

    if (!text) return;

    const externalId = crypto
      .createHash('sha256')
      .update(`${author}|${dateStr}|${text.slice(0, 100)}`)
      .digest('hex');

    reviews.push({
      externalId,
      source: 'yandex',
      author,
      avatarUrl,
      rating,
      text,
      reply,
      publishedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      reviewUrl: `https://yandex.ru/maps/org/${orgId}/reviews/`,
    });
  });

  // Calculate average
  const totalCount = reviews.length;
  const averageRating = totalCount > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount
    : null;

  return { reviews, averageRating, totalCount };
}
