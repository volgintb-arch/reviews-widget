import type { FastifyInstance } from 'fastify';
import { authRoute } from './auth.js';
import { citiesRoute } from './cities.js';
import { reviewsAdminRoute } from './reviews.js';
import { settingsRoute } from './settings.js';
import { refreshRoute } from './refresh.js';
import { alertsRoute } from './alerts.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  // Login — no auth required
  await app.register(authRoute);

  // All other admin routes require JWT
  await app.register(async function adminRoutes(admin) {
    admin.addHook('onRequest', app.authenticate);
    await admin.register(citiesRoute);
    await admin.register(reviewsAdminRoute);
    await admin.register(settingsRoute);
    await admin.register(refreshRoute);
    await admin.register(alertsRoute);
  });
}
