import { api } from './client';

export type Settings = Record<string, string>;

export async function getSettings() {
  const { data } = await api.get<Settings>('/admin/settings');
  return data;
}

export async function updateSettings(settings: Settings) {
  const { data } = await api.put<Settings>('/admin/settings', settings);
  return data;
}
