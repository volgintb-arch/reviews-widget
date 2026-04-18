import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { config } from '../config.js';
import type { RawReview, SourceResult } from './types.js';

const SELECTORS = {
  comment: '.comment',
  author: '.comment__name',
  avatar: '.comment__photo',
  date: '.comment__date',
  text: '.comment__text',
  star: '.stars-list__star',
  starEmpty: '.stars-list__star._empty',
  reply: '.comment__business-answer, .business-answer',
};

const RU_MONTHS: Record<string, number> = {
  'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'мая': 4, 'ма': 4,
  'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11,
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
    const author = $el.find(SELECTORS.author).first().text().trim() || 'Аноним';
    const avatarUrl = $el.find(SELECTORS.avatar).first().attr('src') || null;
    const dateStr = $el.find(SELECTORS.date).first().text().trim();
    const text = $el.find(SELECTORS.text).first().text().trim();

    const totalStars = $el.find(SELECTORS.star).length;
    const emptyStars = $el.find(SELECTORS.starEmpty).length;
    const rating = totalStars > 0 ? totalStars - emptyStars : 5;

    const reply = $el.find(SELECTORS.reply).first().text().trim() || null;

    if (!text) return;

    const publishedAt = parseRussianDate(dateStr);
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
      publishedAt,
      reviewUrl: `https://yandex.ru/maps/org/${orgId}/reviews/`,
    });
  });

  const totalCount = reviews.length;
  const averageRating = totalCount > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount
    : null;

  return { reviews, averageRating, totalCount };
}

function parseRussianDate(s: string): string {
  if (!s) return new Date().toISOString();
  const m = s.trim().toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/);
  if (!m) return new Date().toISOString();

  const day = parseInt(m[1], 10);
  const monthKey = m[2];
  const yearStr = m[3];

  let month = -1;
  for (const key in RU_MONTHS) {
    if (monthKey.startsWith(key)) {
      month = RU_MONTHS[key];
      break;
    }
  }
  if (month < 0) return new Date().toISOString();

  const now = new Date();
  let year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
  const candidate = new Date(Date.UTC(year, month, day, 12, 0, 0));

  if (!yearStr && candidate.getTime() > now.getTime() + 86400000) {
    candidate.setUTCFullYear(year - 1);
  }

  return candidate.toISOString();
}
