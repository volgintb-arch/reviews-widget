import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

// Cache the set of allowed origins pulled from City.site_url. We refresh every
// 5 minutes so adding a city in the admin takes effect within one cache cycle
// without needing a process restart.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { origins: Set<string>; expires: number } | null = null;

async function loadCityOrigins(): Promise<Set<string>> {
  if (cache && cache.expires > Date.now()) return cache.origins;

  const cities = await prisma.city.findMany({
    select: { siteUrl: true },
    where: { siteUrl: { not: null } },
  });
  const origins = new Set<string>();
  for (const c of cities) {
    if (!c.siteUrl) continue;
    try {
      origins.add(new URL(c.siteUrl).origin);
    } catch {
      // ignore malformed URLs
    }
  }
  cache = { origins, expires: Date.now() + CACHE_TTL_MS };
  return origins;
}

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: async (origin, cb) => {
      // Same-origin requests (no Origin header) and server-to-server
      if (!origin) return cb(null, true);

      // Our own domain — admin SPA loads its own assets with crossorigin
      if (origin === config.PUBLIC_API_BASE) return cb(null, true);

      // Static whitelist from .env
      if (config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      // Auto-allow any origin registered as a City.site_url
      try {
        const cityOrigins = await loadCityOrigins();
        if (cityOrigins.has(origin)) return cb(null, true);
      } catch (err) {
        app.log.error({ err }, 'Failed to load city origins for CORS');
      }

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

// Call from admin mutations that change city site_url so new origins take effect immediately
export function invalidateCityOriginsCache() {
  cache = null;
}
