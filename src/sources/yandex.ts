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
  // Try Playwright first (gets all reviews), fall back to static widget
  try {
    return await fetchYandexWithPlaywright(orgId);
  } catch (err) {
    console.warn('[Yandex] Playwright failed, falling back to widget HTML:', err instanceof Error ? err.message : err);
    return await fetchYandexWidget(orgId);
  }
}

async function fetchYandexWithPlaywright(orgId: string): Promise<SourceResult> {
  // Dynamic import — if playwright-core not installed, throws and we fall back
  const { chromium } = await import('playwright-core');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9',
    });

    await page.goto(`https://yandex.ru/maps/org/${orgId}/reviews/`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    // Wait for at least one review to appear
    await page.waitForSelector('[class*="orgpage-reviews-view__review"]', { timeout: 15_000 })
      .catch(() => page.waitForSelector('.business-review-view', { timeout: 5_000 }));

    // Scroll to load all reviews (Yandex uses virtual scroll)
    let prevCount = 0;
    for (let i = 0; i < 20; i++) {
      const count = await page.evaluate(() =>
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        (globalThis as any).document.querySelectorAll('[class*="business-review-view"], [class*="orgpage-reviews-view__review"]').length
      );
      if (count === prevCount && i > 2) break;
      prevCount = count;
      await page.evaluate(() => (globalThis as any).window.scrollBy(0, 1500));
      await page.waitForTimeout(800);
    }

    const html = await page.content();
    const result = parseYandexMapsHtml(html, orgId);

    // If Playwright got fewer than widget, something went wrong
    if (result.reviews.length === 0) {
      throw new Error('Playwright got 0 reviews from maps page');
    }

    console.log(`[Yandex] Playwright got ${result.reviews.length} reviews for org ${orgId}`);
    return result;
  } finally {
    await browser.close();
  }
}

async function fetchYandexWidget(orgId: string): Promise<SourceResult> {
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

// Parse Yandex Maps SPA page (Playwright result)
function parseYandexMapsHtml(html: string, orgId: string): SourceResult {
  const $ = cheerio.load(html);
  const reviews: RawReview[] = [];

  // Yandex Maps uses several possible class naming patterns
  const reviewEls = $('[class*="business-review-view__review"], .business-review-view, [class*="orgpage-reviews-view__review"]');

  reviewEls.each((_, el) => {
    const $el = $(el);

    const author = (
      $el.find('[class*="business-review-view__author"]').first().text().trim() ||
      $el.find('[class*="review-author"]').first().text().trim() ||
      'Аноним'
    );

    const avatarUrl = (
      $el.find('[class*="user-pic"] img').first().attr('src') ||
      $el.find('[class*="avatar"] img').first().attr('src') ||
      null
    );

    const dateStr = (
      $el.find('[class*="business-review-view__date"]').first().text().trim() ||
      $el.find('meta[itemprop="datePublished"]').attr('content') ||
      ''
    );

    const text = (
      $el.find('[class*="business-review-view__body-text"]').first().text().trim() ||
      $el.find('[class*="review-text"]').first().text().trim() ||
      ''
    );

    if (!text) return;

    // Rating: count filled stars
    const filledStars = $el.find('[class*="stars__icon_full"], [class*="icon_color_yellow"]').length ||
      $el.find('[class*="rating__star"]').filter((_, s) => !$(s).hasClass('rating__star_empty')).length;
    const rating = filledStars > 0 && filledStars <= 5 ? filledStars : 5;

    const reply = $el.find('[class*="business-review-view__official-answer"]').first().text().trim() || null;

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

// Parse static Yandex reviews widget HTML (fallback)
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
  const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
  const candidate = new Date(Date.UTC(year, month, day, 12, 0, 0));

  if (!yearStr && candidate.getTime() > now.getTime() + 86400000) {
    candidate.setUTCFullYear(year - 1);
  }

  return candidate.toISOString();
}
