import { api } from './client';

export interface Review {
  id: string;
  source: string;
  author: string;
  avatar_url: string | null;
  rating: number;
  text: string;
  reply: string | null;
  published_at: string;
  is_hidden: boolean;
  review_url: string | null;
}

export interface ReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  page_size: number;
}

export async function listReviews(params: {
  city?: string;
  source?: string;
  hidden?: string;
  page?: number;
  page_size?: number;
}) {
  const { data } = await api.get<ReviewsResponse>('/admin/reviews', { params });
  return data;
}

export async function toggleHidden(id: string, is_hidden: boolean) {
  const { data } = await api.patch<Review>(`/admin/reviews/${id}`, { is_hidden });
  return data;
}
