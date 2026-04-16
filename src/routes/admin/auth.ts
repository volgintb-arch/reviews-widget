import type { FastifyInstance } from 'fastify';
import { verifyCredentials } from '../../lib/auth.js';
import { z } from 'zod';

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoute(app: FastifyInstance) {
  app.post('/api/admin/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { login, password } = parsed.data;

    if (!verifyCredentials(login, password)) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ sub: 'admin', role: 'admin' });
    return { token, expires_in: 86400 };
  });
}
