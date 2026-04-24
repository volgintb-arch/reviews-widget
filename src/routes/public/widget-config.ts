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

    let projectRow = await prisma.project.findUnique({ where: { slug: projectSlug } });
    let cityData = projectRow
      ? await prisma.city.findUnique({
          where: { projectId_slug: { projectId: projectRow.id, slug: city } },
        })
      : null;

    // Fallback: if the city was not found in the given project (or the given
    // project doesn't exist), try to resolve the city unambiguously across all
    // projects — so legacy embeds without data-project keep working.
    if (!cityData) {
      const candidates = await prisma.city.findMany({
        where: { slug: city },
        include: { project: true },
      });
      if (candidates.length === 1) {
        cityData = candidates[0];
        projectRow = candidates[0].project;
      } else if (candidates.length === 0) {
        return reply.status(404).send({ error: 'City not found' });
      } else {
        return reply.status(409).send({
          error: 'City slug exists in multiple projects — specify data-project',
        });
      }
    }

    if (!projectRow) {
      return reply.status(404).send({ error: 'Project not found' });
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
