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
  const { chromium } = await import('playwright-core');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ru-RU',
      timezoneId: 'Asia/Novosibirsk',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    // Hide headless indicators
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto(`https://yandex.ru/maps/org/${orgId}/reviews/`, {
      waitUntil: 'domcontentloaded',
      timeout: 40_000,
    });

    // Dismiss cookie consent if shown
    await page.locator('button:has-text("Принять"), button:has-text("Хорошо"), [class*="CookieAgreement"] button').first()
      .click({ timeout: 3_000 })
      .catch(() => {});

    // Wait for reviews list — try multiple selectors
    const reviewSelector = '.business-review-view, [class*="business-review-view__review"], [class*="orgpage-reviews-view"] [class*="review"]';
    await page.waitForSelector(reviewSelector, { timeout: 20_000 });

    // Scroll inside the reviews panel to load more
    const scrollContainer = await page.$('[class*="scroll__content"], [class*="sidebar-view__panel"], .sidebar-view__panel-content');

    let prevCount = 0;
    for (let i = 0; i < 25; i++) {
      const count = await page.locator('.business-review-view, [class*="business-review-view__review"]').count();
      if (count === prevCount && i > 3) break;
      prevCount = count;

      if (scrollContainer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await scrollContainer.evaluate((el: any) => el.scrollBy(0, 2000));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => (globalThis as any).window.scrollBy(0, 2000));
      }
      await page.waitForTimeout(600);
    }

    const html = await page.content();

    // Save debug HTML in case selectors fail
    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/yandex-debug.html', html);

    const result = parseYandexMapsHtml(html, orgId);

    if (result.reviews.length === 0) {
      throw new Error('Playwright got 0 reviews — check /tmp/yandex-debug.html');
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

  // Log what we found for debugging
  const counts = {
    'business-review-view': $('.business-review-view').length,
    '[class*=review-view]': $('[class*="review-view"]').length,
    '[class*=business-review]': $('[class*="business-review"]').length,
    '[itemprop=review]': $('[itemprop="review"]').length,
  };
  console.log('[Yandex] Selector counts:', JSON.stringify(counts));

  // Log rating-related classes to find correct selector
  const ratingClasses = new Set<string>();
  $('[class]').each((_, el) => {
    const cls = $(el).attr('class') || '';
    if (cls.includes('rating') || cls.includes('stars')) ratingClasses.add(cls.split(' ').find(c => c.includes('rating') || c.includes('stars')) || '');
  });
  console.log('[Yandex] Rating/stars classes found:', [...ratingClasses].filter(Boolean).slice(0, 15).join(', '));


  const reviewEls = $('[class*="business-review-view__review"], .business-review-view, [class*="orgpage-reviews-view__review"]');

  reviewEls.each((_, el) => {
    const $el = $(el);

    const author = $el.find('.business-review-view__author-name').first().text().trim() || 'Аноним';

    // Yandex uses background-image on .user-icon-view__icon, not an <img> tag
    const iconEl = $el.find('.user-icon-view__icon').first();
    const bgStyle = iconEl.attr('style') || '';
    const bgMatch = bgStyle.match(/background-image:\s*url\(["']?(https?[^"')]+)["']?\)/);
    const avatarUrl = bgMatch ? bgMatch[1] : null;

    const dateStr = $el.find('.business-review-view__date').first().text().trim();

    const text = $el.find('.business-review-view__body').first().text().trim();

    if (!text) return;

    // Count filled stars inside this review's rating block
    const filledStars = $el.find('.business-review-view__rating [class*="__star"][class*="_full"], .business-review-view__rating ._full').length;
    const rating = filledStars > 0 && filledStars <= 5 ? filledStars : 5;

    const reply = $el.find('.business-review-view__comment-expand').first().text().trim() || null;

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

  // Extract the real overall rating and total count from the page
  // (Yandex counts all ratings, including those without text)
  const ratingText = $('.business-summary-rating-badge-view__rating, .business-summary-rating__main-rating').first().text().trim();
  const countText = $('.business-summary-rating-badge-view__rating-count').first().text().trim();
  console.log('[Yandex] Page rating:', ratingText, 'count text:', countText);

  const pageRating = ratingText ? parseFloat(ratingText.replace(',', '.')) : null;
  const countMatch = countText.match(/\d+/);
  const pageCount = countMatch ? parseInt(countMatch[0], 10) : null;

  const totalCount = pageCount ?? reviews.length;
  const averageRating = (pageRating && !isNaN(pageRating))
    ? pageRating
    : (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null);

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
