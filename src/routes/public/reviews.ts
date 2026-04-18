import type { FastifyInstance } from 'fastify';
import { getPublicReviews } from '../../cache/repository.js';

export async function reviewsRoute(app: FastifyInstance) {
  app.get('/api/reviews', async (request, reply) => {
    const { city, source, limit } = request.query as {
      city?: string;
      source?: string;
      limit?: string;
    };

    if (!city) {
      return reply.status(400).send({ error: 'city parameter is required' });
    }

    const result = await getPublicReviews({
      citySlug: city,
      source: source || undefined,
      limit: limit ? parseInt(limit, 10) : 200,
    });

    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return result;
  });
}
