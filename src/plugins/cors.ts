import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return cb(null, true);
      if (config.ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      // In development, also allow localhost
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
