import { api } from './client';

export type AlertLevel = 'info' | 'warning' | 'error';

export interface Alert {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
  acknowledged_at: string | null;
}

export async function listAlerts(status: 'unread' | 'all' = 'all') {
  const { data } = await api.get<Alert[]>('/admin/alerts', { params: { status } });
  return data;
}

export async function getUnreadCount() {
  const { data } = await api.get<{ count: number }>('/admin/alerts/unread-count');
  return data.count;
}

export async function ackAlert(id: number) {
  await api.post(`/admin/alerts/${id}/ack`);
}

export async function ackAllAlerts() {
  const { data } = await api.post<{ count: number }>('/admin/alerts/ack-all');
  return data.count;
}

export async function deleteAlert(id: number) {
  await api.delete(`/admin/alerts/${id}`);
}
