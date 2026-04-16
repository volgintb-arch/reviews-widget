import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { z } from 'zod';

const cityCreateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(20),
  name: z.string().min(1).max(50),
  site_url: z.string().url().optional().or(z.literal('')),
  twogis_firm_id: z.string().optional().or(z.literal('')),
  yandex_org_id: z.string().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

const cityUpdateSchema = cityCreateSchema.partial().omit({ slug: true });

export async function citiesRoute(app: FastifyInstance) {
  // List all cities
  app.get('/api/admin/cities', async () => {
    const cities = await prisma.city.findMany({
      include: {
        statuses: true,
        _count: { select: { reviews: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return cities.map(city => ({
      id: city.id,
      slug: city.slug,
      name: city.name,
      twogis_firm_id: city.twogisFirmId,
      yandex_org_id: city.yandexOrgId,
      site_url: city.siteUrl,
      is_active: city.isActive,
      reviews_count: city._count.reviews,
      statuses: city.statuses.map(s => ({
        source: s.source,
        last_success_at: s.lastSuccessAt?.toISOString() ?? null,
        last_error_at: s.lastErrorAt?.toISOString() ?? null,
        last_error: s.lastError,
        reviews_count: s.reviewsCount,
        average_rating: s.averageRating,
      })),
    }));
  });

  // Get single city
  app.get('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const city = await prisma.city.findUnique({
      where: { slug },
      include: { statuses: true, _count: { select: { reviews: true } } },
    });
    if (!city) return reply.status(404).send({ error: 'City not found' });
    return {
      ...city,
      twogis_firm_id: city.twogisFirmId,
      yandex_org_id: city.yandexOrgId,
      site_url: city.siteUrl,
      is_active: city.isActive,
      reviews_count: city._count.reviews,
    };
  });

  // Create city
  app.post('/api/admin/cities', async (request, reply) => {
    const parsed = cityCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const { slug, name, site_url, twogis_firm_id, yandex_org_id, is_active } = parsed.data;

    const existing = await prisma.city.findUnique({ where: { slug } });
    if (existing) {
      return reply.status(409).send({ error: 'City with this slug already exists' });
    }

    const city = await prisma.city.create({
      data: {
        slug,
        name,
        siteUrl: site_url || null,
        twogisFirmId: twogis_firm_id || null,
        yandexOrgId: yandex_org_id || null,
        isActive: is_active,
      },
    });

    return reply.status(201).send(city);
  });

  // Update city
  app.put('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = cityUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.site_url !== undefined) data.siteUrl = parsed.data.site_url || null;
    if (parsed.data.twogis_firm_id !== undefined) data.twogisFirmId = parsed.data.twogis_firm_id || null;
    if (parsed.data.yandex_org_id !== undefined) data.yandexOrgId = parsed.data.yandex_org_id || null;
    if (parsed.data.is_active !== undefined) data.isActive = parsed.data.is_active;

    try {
      const city = await prisma.city.update({ where: { slug }, data });
      return city;
    } catch {
      return reply.status(404).send({ error: 'City not found' });
    }
  });

  // Delete city
  app.delete('/api/admin/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try {
      await prisma.city.delete({ where: { slug } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'City not found' });
    }
  });
}
