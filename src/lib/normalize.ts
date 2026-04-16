export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\u00a0/g, ' ')      // non-breaking space → regular space
    .replace(/\s{2,}/g, ' ');      // collapse multiple spaces
}

export function normalizeDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

export function hashId(source: string, externalId: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(`${source}:${externalId}`).digest('hex');
}

export function shouldIncludeReview(
  text: string,
  rating: number,
  minRating: number,
  minTextLength: number,
): boolean {
  if (rating < minRating) return false;
  if (text.length < minTextLength) return false;
  return true;
}
