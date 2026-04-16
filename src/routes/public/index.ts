import type { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';
import { reviewsRoute } from './reviews.js';
import { widgetConfigRoute } from './widget-config.js';

export async function registerPublicRoutes(app: FastifyInstance) {
  await app.register(healthRoute);
  await app.register(reviewsRoute);
  await app.register(widgetConfigRoute);
}
