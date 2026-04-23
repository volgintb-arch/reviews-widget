import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

export async function alertsRoute(app: FastifyInstance) {
  // List alerts (unread first, then recent)
  app.get('/api/admin/alerts', async (request) => {
    const { status } = request.query as { status?: 'unread' | 'all' };
    const where = status === 'unread' ? { acknowledgedAt: null } : {};

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [
        { acknowledgedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'desc' },
      ],
      take: 200,
    });

    return alerts.map(a => ({
      id: a.id,
      level: a.level,
      title: a.title,
      message: a.message,
      context: a.context,
      created_at: a.createdAt.toISOString(),
      acknowledged_at: a.acknowledgedAt?.toISOString() ?? null,
    }));
  });

  // Unread count (for sidebar badge)
  app.get('/api/admin/alerts/unread-count', async () => {
    const count = await prisma.alert.count({ where: { acknowledgedAt: null } });
    return { count };
  });

  // Acknowledge one
  app.post('/api/admin/alerts/:id/ack', async (request, reply) => {
    const { id } = request.params as { id: string };
    const alertId = parseInt(id, 10);
    if (isNaN(alertId)) return reply.status(400).send({ error: 'invalid id' });

    await prisma.alert.update({
      where: { id: alertId },
      data: { acknowledgedAt: new Date() },
    }).catch(() => null);
    return { ok: true };
  });

  // Acknowledge all unread
  app.post('/api/admin/alerts/ack-all', async () => {
    const result = await prisma.alert.updateMany({
      where: { acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    return { count: result.count };
  });

  // Delete one
  app.delete('/api/admin/alerts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const alertId = parseInt(id, 10);
    if (isNaN(alertId)) return reply.status(400).send({ error: 'invalid id' });

    await prisma.alert.delete({ where: { id: alertId } }).catch(() => null);
    return reply.status(204).send();
  });
}
