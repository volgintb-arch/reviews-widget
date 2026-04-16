export interface RawReview {
  externalId: string;
  source: '2gis' | 'yandex';
  author: string;
  avatarUrl: string | null;
  rating: number;
  text: string;
  reply: string | null;
  reviewUrl: string | null;
  publishedAt: string; // ISO 8601
}

export interface SourceResult {
  reviews: RawReview[];
  averageRating: number | null;
  totalCount: number;
}
