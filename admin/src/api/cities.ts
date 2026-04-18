import { api } from './client';

export interface City {
  id: number;
  slug: string;
  name: string;
  twogis_firm_id: string | null;
  yandex_org_id: string | null;
  site_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  reviews_count?: number;
  sources?: SourceStatus[];
}

export interface SourceStatus {
  source: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  reviews_count: number;
  average_rating: number | null;
}

export async function listCities() {
  const { data } = await api.get<City[]>('/admin/cities');
  return data;
}

export async function getCity(slug: string) {
  const { data } = await api.get<City>(`/admin/cities/${slug}`);
  return data;
}

export async function createCity(body: Record<string, unknown>) {
  const { data } = await api.post<City>('/admin/cities', body);
  return data;
}

export async function updateCity(slug: string, body: Record<string, unknown>) {
  const { data } = await api.put<City>(`/admin/cities/${slug}`, body);
  return data;
}

export async function deleteCity(slug: string) {
  await api.delete(`/admin/cities/${slug}`);
}

export async function refreshCity(slug: string) {
  await api.post(`/admin/cities/${slug}/refresh`);
}
