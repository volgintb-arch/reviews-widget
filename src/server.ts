import 'dotenv/config';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerCors } from './plugins/cors.js';
import { registerAuth } from './plugins/auth.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerPublicRoutes } from './routes/public/index.js';
import { registerAdminRoutes } from './routes/admin/index.js';
import { setupCron } from './jobs/refresh.js';
import { prisma } from './lib/prisma.js';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// Plugins
await app.register(helmet, {
  crossOriginResourcePolicy: false,
});
await registerCors(app);
await registerRateLimit(app);
await registerAuth(app);

// Serve admin SPA static files
const adminDistPath = path.resolve(__dirname, '../admin/dist');
await app.register(fastifyStatic, {
  root: adminDistPath,
  prefix: '/admin/',
  decorateReply: false,
  wildcard: false,
});

// Admin SPA fallback — serve index.html for client-side routes
app.get('/admin/*', async (_request, reply) => {
  return reply.sendFile('index.html', adminDistPath);
});
app.get('/admin', async (_request, reply) => {
  return reply.redirect('/admin/');
});

// Serve widget.js
const widgetDistPath = path.resolve(__dirname, '../widget/dist');
await app.register(fastifyStatic, {
  root: widgetDistPath,
  prefix: '/widget/',
  decorateReply: false,
});

// Routes
await registerPublicRoutes(app);
await registerAdminRoutes(app);

// Start
const start = async () => {
  try {
    // Check DB connectivity
    await prisma.$connect();
    app.log.info('Database connected');

    // Check if DB is empty — if so, run initial refresh
    const reviewCount = await prisma.review.count();
    if (reviewCount === 0) {
      app.log.info('No reviews in DB, triggering initial refresh...');
      const { refreshAll } = await import('./jobs/refresh.js');
      await Promise.race([
        refreshAll(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Initial refresh timeout')), 60000)),
      ]).catch(err => {
        app.log.error({ err }, 'Initial refresh failed, will retry on next cron');
      });
    }

    // Start cron
    setupCron();

    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
const graceful = async () => {
  app.log.info('Shutting down...');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);
