import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { memoryCache } from '../../cache/memory.js';

export async function reviewsAdminRoute(app: FastifyInstance) {
  // List reviews with filters and pagination
  app.get('/api/admin/reviews', async (request) => {
    const { city, source, hidden, page, page_size } = request.query as {
      city?: string;
      source?: string;
      hidden?: string;
      page?: string;
      page_size?: string;
    };

    const pageNum = parseInt(page || '1', 10);
    const pageSize = Math.min(parseInt(page_size || '50', 10), 100);
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (city) {
      const cityData = await prisma.city.findUnique({ where: { slug: city } });
      if (cityData) where.cityId = cityData.id;
    }

    if (source) where.source = source;

    if (hidden === 'true') {
      where.isHidden = true;
    } else if (hidden === 'false' || !hidden) {
      where.isHidden = false;
    }
    // hidden=all — no filter

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: pageSize,
        include: { city: { select: { slug: true, name: true } } },
      }),
      prisma.review.count({ where }),
    ]);

    return {
      reviews: reviews.map(r => ({
        id: r.id,
        source: r.source,
        author: r.author,
        avatar_url: r.avatarUrl,
        rating: r.rating,
        text: r.text,
        reply: r.reply,
        review_url: r.reviewUrl,
        published_at: r.publishedAt.toISOString(),
        is_hidden: r.isHidden,
        city_slug: r.city.slug,
        city_name: r.city.name,
      })),
      total,
      page: pageNum,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    };
  });

  // Toggle review visibility
  app.patch('/api/admin/reviews/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { is_hidden } = request.body as { is_hidden: boolean };

    if (typeof is_hidden !== 'boolean') {
      return reply.status(400).send({ error: 'is_hidden must be a boolean' });
    }

    try {
      const review = await prisma.review.update({
        where: { id },
        data: { isHidden: is_hidden },
      });
      // Invalidate cache so widget picks up change
      memoryCache.flushAll();
      return { id: review.id, is_hidden: review.isHidden };
    } catch {
      return reply.status(404).send({ error: 'Review not found' });
    }
  });
}
