import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin requests (no Origin header) and server-to-server
      if (!origin) return cb(null, true);

      // Our own domain — admin SPA loads its own assets with crossorigin
      if (origin === config.PUBLIC_API_BASE) return cb(null, true);

      // Widget embedding sites
      if (config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      if (config.NODE_ENV === 'development' && (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      )) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });
}
