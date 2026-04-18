import { api } from './client';

export async function login(login: string, password: string) {
  const { data } = await api.post<{ token: string; expires_in: number }>('/admin/login', { login, password });
  return data;
}
