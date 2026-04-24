import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { memoryCache } from '../../cache/memory.js';

const projectCreateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Only lowercase, digits, dash').min(2).max(32),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().or(z.literal('')),
});

const projectUpdateSchema = projectCreateSchema.partial().omit({ slug: true });

export async function projectsRoute(app: FastifyInstance) {
  // List all projects
  app.get('/api/admin/projects', async () => {
    const projects = await prisma.project.findMany({
      include: { _count: { select: { cities: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return projects.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      cities_count: p._count.cities,
      created_at: p.createdAt.toISOString(),
    }));
  });

  // Get one project
  app.get('/api/admin/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const p = await prisma.project.findUnique({
      where: { slug },
      include: { _count: { select: { cities: true } } },
    });
    if (!p) return reply.status(404).send({ error: 'Project not found' });
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      cities_count: p._count.cities,
      created_at: p.createdAt.toISOString(),
    };
  });

  // Create project
  app.post('/api/admin/projects', async (request, reply) => {
    const parsed = projectCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.format() });

    const existing = await prisma.project.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return reply.status(409).send({ error: 'Project with this slug exists' });

    const project = await prisma.project.create({
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });
    return reply.status(201).send(project);
  });

  // Update project
  app.put('/api/admin/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = projectUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.format() });

    try {
      const project = await prisma.project.update({
        where: { slug },
        data: {
          ...(parsed.data.name !== undefined && { name: parsed.data.name }),
          ...(parsed.data.description !== undefined && { description: parsed.data.description || null }),
        },
      });
      return project;
    } catch {
      return reply.status(404).send({ error: 'Project not found' });
    }
  });

  // Delete project (only if no cities)
  app.delete('/api/admin/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = await prisma.project.findUnique({
      where: { slug },
      include: { _count: { select: { cities: true } } },
    });
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    if (project._count.cities > 0) {
      return reply.status(409).send({ error: 'Нельзя удалить проект с городами' });
    }
    await prisma.project.delete({ where: { id: project.id } });
    memoryCache.flushAll();
    return reply.status(204).send();
  });

  // ---- Project settings ----

  app.get('/api/admin/projects/:slug/settings', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = await prisma.project.findUnique({ where: { slug } });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const rows = await prisma.projectSetting.findMany({ where: { projectId: project.id } });
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        out[r.key] = r.value;
      }
    }
    return out;
  });

  app.put('/api/admin/projects/:slug/settings', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be an object' });
    }

    const project = await prisma.project.findUnique({ where: { slug } });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    for (const [key, value] of Object.entries(body)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await prisma.projectSetting.upsert({
        where: { projectId_key: { projectId: project.id, key } },
        create: { projectId: project.id, key, value: stringValue },
        update: { value: stringValue },
      });
    }

    memoryCache.flushAll();
    return { ok: true };
  });
}
