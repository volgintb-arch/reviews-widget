import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { memoryCache } from '../../cache/memory.js';

const DEFAULT_PROJECT_SLUG = 'reviews';

export async function widgetConfigRoute(app: FastifyInstance) {
  app.get('/api/widget/config', async (request, reply) => {
    const { city, project } = request.query as { city?: string; project?: string };
    if (!city) {
      return reply.status(400).send({ error: 'city parameter is required' });
    }

    const projectSlug = project || DEFAULT_PROJECT_SLUG;
    const cacheKey = `widget-config:${projectSlug}:${city}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'public, max-age=300');
      return cached;
    }

    const projectRow = await prisma.project.findUnique({ where: { slug: projectSlug } });
    if (!projectRow) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const cityData = await prisma.city.findUnique({
      where: { projectId_slug: { projectId: projectRow.id, slug: city } },
    });
    if (!cityData) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const settings = await prisma.projectSetting.findMany({
      where: { projectId: projectRow.id },
    });
    const settingsMap: Record<string, unknown> = {};
    for (const s of settings) {
      const key = s.key.replace(/^widget\./, '');
      try {
        settingsMap[key] = JSON.parse(s.value);
      } catch {
        settingsMap[key] = s.value;
      }
    }

    const override = (cityData.configOverride ?? {}) as Record<string, unknown>;

    const result = {
      ...settingsMap,
      ...override,
      project_slug: projectRow.slug,
      project_name: projectRow.name,
      city_name: cityData.name,
      site_url: cityData.siteUrl,
    };

    memoryCache.set(cacheKey, result);
    reply.header('Cache-Control', 'public, max-age=300');
    return result;
  });
}
