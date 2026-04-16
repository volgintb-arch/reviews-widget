import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { memoryCache } from '../../cache/memory.js';

export async function widgetConfigRoute(app: FastifyInstance) {
  app.get('/api/widget/config', async (request, reply) => {
    const { city } = request.query as { city?: string };
    if (!city) {
      return reply.status(400).send({ error: 'city parameter is required' });
    }

    const cacheKey = `widget-config:${city}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'public, max-age=300');
      return cached;
    }

    const cityData = await prisma.city.findUnique({ where: { slug: city } });
    if (!cityData) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      const key = s.key.replace('widget.', '');
      try {
        settingsMap[key] = JSON.parse(s.value);
      } catch {
        settingsMap[key] = s.value;
      }
    }

    const result = {
      ...settingsMap,
      city_name: cityData.name,
      site_url: cityData.siteUrl,
    };

    memoryCache.set(cacheKey, result);
    reply.header('Cache-Control', 'public, max-age=300');
    return result;
  });
}
