import type { FastifyInstance } from 'fastify';

const ALLOWED_HOSTS = new Set([
  'avatars.mds.yandex.net',
  'avatars.yandex.net',
  'yastat.net',
]);

export async function proxyRoute(app: FastifyInstance) {
  app.get('/api/proxy/img', async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) return reply.status(400).send({ error: 'url required' });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.status(400).send({ error: 'invalid url' });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return reply.status(403).send({ error: 'host not allowed' });
    }

    try {
      const res = await fetch(url, {
        headers: {
          'Referer': 'https://yandex.ru/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!res.ok) return reply.status(res.status).send();

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const buffer = Buffer.from(await res.arrayBuffer());

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400')
        .send(buffer);
    } catch {
      reply.status(502).send();
    }
  });
}
