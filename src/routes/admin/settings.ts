import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { memoryCache } from '../../cache/memory.js';

export async function settingsRoute(app: FastifyInstance) {
  // Get all settings
  app.get('/api/admin/settings', async () => {
    const settings = await prisma.setting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      try {
        result[s.key] = JSON.parse(s.value);
      } catch {
        result[s.key] = s.value;
      }
    }
    return result;
  });

  // Batch update settings
  app.put('/api/admin/settings', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be an object' });
    }

    for (const [key, value] of Object.entries(body)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: stringValue },
        update: { value: stringValue },
      });
    }

    // Invalidate widget-config cache
    memoryCache.flushAll();

    return { ok: true };
  });
}
