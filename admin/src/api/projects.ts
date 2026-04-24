import { api } from './client';

export interface Project {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  cities_count: number;
  created_at: string;
}

export async function listProjects() {
  const { data } = await api.get<Project[]>('/admin/projects');
  return data;
}

export async function getProject(slug: string) {
  const { data } = await api.get<Project>(`/admin/projects/${slug}`);
  return data;
}

export async function createProject(body: { slug: string; name: string; description?: string }) {
  const { data } = await api.post<Project>('/admin/projects', body);
  return data;
}

export async function updateProject(slug: string, body: { name?: string; description?: string }) {
  const { data } = await api.put<Project>(`/admin/projects/${slug}`, body);
  return data;
}

export async function deleteProject(slug: string) {
  await api.delete(`/admin/projects/${slug}`);
}

export type ProjectSettings = Record<string, string>;

export async function getProjectSettings(slug: string) {
  const { data } = await api.get<ProjectSettings>(`/admin/projects/${slug}/settings`);
  return data;
}

export async function updateProjectSettings(slug: string, settings: ProjectSettings) {
  const { data } = await api.put<{ ok: boolean }>(`/admin/projects/${slug}/settings`, settings);
  return data;
}
