import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const startTime = process.hrtime.bigint();
    const uptimeSeconds = Math.floor(process.uptime());

    const cities = await prisma.city.findMany({
      where: { isActive: true },
      include: { statuses: true },
    });

    const citiesStatus = cities.map(city => ({
      slug: city.slug,
      sources: Object.fromEntries(
        city.statuses.map(s => [
          s.source,
          {
            last_success: s.lastSuccessAt?.toISOString() ?? null,
            count: s.reviewsCount,
          },
        ]),
      ),
    }));

    reply.send({
      status: 'ok',
      uptime_seconds: uptimeSeconds,
      cities: citiesStatus,
    });
  });
}
