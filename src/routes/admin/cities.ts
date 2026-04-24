import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { z } from 'zod';

const nullableUrl = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().url().optional(),
);
const nullableString = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().optional(),
);

const cityCreateSchema = z.object({
  project_slug: z.string().min(1).default('reviews'),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(32),
  name: z.string().min(1).max(50),
  site_url: nullableUrl,
  twogis_firm_id: nullableString,
  yandex_org_id: nullableString,
  is_active: z.boolean().default(true),
});

const cityUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  site_url: nullableUrl,
  twogis_firm_id: nullableString,
  yandex_org_id: nullableString,
  is_active: z.boolean().optional(),
  config_override: z.record(z.string(), z.unknown()).nullable().optional(),
});

function formatCity(city: any) {
  return {
    id: city.id,
    project_id: city.projectId,
    project_slug: city.project?.slug,
    slug: city.slug,
    name: city.name,
    twogis_firm_id: city.twogisFirmId,
    yandex_org_id: city.yandexOrgId,
    site_url: city.siteUrl,
    is_active: city.isActive,
    config_override: city.configOverride ?? null,
    reviews_count: city._count?.reviews ?? 0,
    sources: (city.statuses ?? []).map((s: any) => ({
      source: s.source,
      last_success_at: s.lastSuccessAt?.toISOString() ?? null,
      last_error_at: s.lastErrorAt?.toISOString() ?? null,
      last_error: s.lastError,
      reviews_count: s.reviewsCount,
      average_rating: s.averageRating,
    })),
  };
}

export async function citiesRoute(app: FastifyInstance) {
  // List cities, optionally filtered by project slug
  app.get('/api/admin/cities', async (request) => {
    const { project } = request.query as { project?: string };
    const where = project
      ? { project: { slug: project } }
      : {};
    const cities = await prisma.city.findMany({
      where,
      include: {
        project: true,
        statuses: true,
        _count: { select: { reviews: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return cities.map(formatCity);
  });

  // Get a single city by slug (fails if slug collides across projects — pass ?project= to disambiguate)
  app.get('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { project } = request.query as { project?: string };

    const cities = await prisma.city.findMany({
      where: project ? { slug, project: { slug: project } } : { slug },
      include: { project: true, statuses: true, _count: { select: { reviews: true } } },
    });
    if (cities.length === 0) return reply.status(404).send({ error: 'City not found' });
    if (cities.length > 1) {
      return reply.status(409).send({ error: 'Slug ambiguous across projects — provide ?project=' });
    }
    return formatCity(cities[0]);
  });

  // Create city
  app.post('/api/admin/cities', async (request, reply) => {
    const parsed = cityCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }
    const { project_slug, slug, name, site_url, twogis_firm_id, yandex_org_id, is_active } = parsed.data;

    const project = await prisma.project.findUnique({ where: { slug: project_slug } });
    if (!project) return reply.status(404).send({ error: `Project "${project_slug}" not found` });

    const existing = await prisma.city.findUnique({
      where: { projectId_slug: { projectId: project.id, slug } },
    });
    if (existing) {
      return reply.status(409).send({ error: 'City with this slug already exists in project' });
    }

    const city = await prisma.city.create({
      data: {
        projectId: project.id,
        slug,
        name,
        siteUrl: site_url || null,
        twogisFirmId: twogis_firm_id || null,
        yandexOrgId: yandex_org_id || null,
        isActive: is_active,
      },
      include: { project: true, statuses: true, _count: { select: { reviews: true } } },
    });
    return reply.status(201).send(formatCity(city));
  });

  // Update city
  app.put('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { project } = request.query as { project?: string };
    const parsed = cityUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const existing = await prisma.city.findMany({
      where: project ? { slug, project: { slug: project } } : { slug },
    });
    if (existing.length === 0) return reply.status(404).send({ error: 'City not found' });
    if (existing.length > 1) return reply.status(409).send({ error: 'Slug ambiguous — provide ?project=' });

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.site_url !== undefined) data.siteUrl = parsed.data.site_url || null;
    if (parsed.data.twogis_firm_id !== undefined) data.twogisFirmId = parsed.data.twogis_firm_id || null;
    if (parsed.data.yandex_org_id !== undefined) data.yandexOrgId = parsed.data.yandex_org_id || null;
    if (parsed.data.is_active !== undefined) data.isActive = parsed.data.is_active;
    if (parsed.data.config_override !== undefined) {
      data.configOverride = parsed.data.config_override ?? null;
    }

    const updated = await prisma.city.update({
      where: { id: existing[0].id },
      data,
      include: { project: true, statuses: true, _count: { select: { reviews: true } } },
    });
    return formatCity(updated);
  });

  // Delete city
  app.delete('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { project } = request.query as { project?: string };

    const existing = await prisma.city.findMany({
      where: project ? { slug, project: { slug: project } } : { slug },
    });
    if (existing.length === 0) return reply.status(404).send({ error: 'City not found' });
    if (existing.length > 1) return reply.status(409).send({ error: 'Slug ambiguous — provide ?project=' });

    await prisma.city.delete({ where: { id: existing[0].id } });
    return reply.status(204).send();
  });
}
