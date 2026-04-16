import type { FastifyInstance } from 'fastify';
import { refreshCity } from '../../jobs/refresh.js';

export async function refreshRoute(app: FastifyInstance) {
  app.post('/api/admin/cities/:slug/refresh', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    // Fire and forget — return 202 immediately
    refreshCity(slug).catch(err => {
      app.log.error({ err, slug }, 'Background refresh failed');
    });

    return reply.status(202).send({ message: 'Refresh started' });
  });
}
