import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    // Static SPA assets and widget bundle — no limit. The admin SPA fires many
    // parallel requests on first paint and the widget bundle is polled by
    // every visitor of every Tilda page.
    allowList: (request: FastifyRequest) => {
      const url = request.url;
      return url.startsWith('/admin') || url.startsWith('/widget/');
    },
  });
}
