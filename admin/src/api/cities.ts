import { api } from './client';

export interface City {
  id: number;
  project_id: number;
  project_slug?: string;
  slug: string;
  name: string;
  twogis_firm_id: string | null;
  yandex_org_id: string | null;
  site_url: string | null;
  is_active: boolean;
  config_override: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
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

export async function listCities(projectSlug?: string) {
  const { data } = await api.get<City[]>('/admin/cities', {
    params: projectSlug ? { project: projectSlug } : {},
  });
  return data;
}

export async function getCity(slug: string, projectSlug?: string) {
  const { data } = await api.get<City>(`/admin/cities/${slug}`, {
    params: projectSlug ? { project: projectSlug } : {},
  });
  return data;
}

export async function createCity(body: Record<string, unknown>) {
  const { data } = await api.post<City>('/admin/cities', body);
  return data;
}

export async function updateCity(slug: string, body: Record<string, unknown>, projectSlug?: string) {
  const { data } = await api.put<City>(`/admin/cities/${slug}`, body, {
    params: projectSlug ? { project: projectSlug } : {},
  });
  return data;
}

export async function deleteCity(slug: string, projectSlug?: string) {
  await api.delete(`/admin/cities/${slug}`, {
    params: projectSlug ? { project: projectSlug } : {},
  });
}

export async function refreshCity(slug: string) {
  await api.post(`/admin/cities/${slug}/refresh`);
}
