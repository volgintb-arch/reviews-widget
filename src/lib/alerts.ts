import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type AlertLevel = 'info' | 'warning' | 'error';

interface CreateAlertInput {
  level: AlertLevel;
  title: string;
  message: string;
  dedupeKey: string;
  context?: Record<string, unknown>;
  dedupeMs?: number;
}

const DEFAULT_DEDUPE_MS = 6 * 60 * 60 * 1000; // 6h

// Create an admin-visible alert. Deduplicates against existing UNACKNOWLEDGED
// alerts with the same dedupeKey within dedupeMs — so a broken scraper running
// 4x/day produces one alert, not four. Acknowledging an alert clears the
// dedupe window so new occurrences create fresh alerts.
export async function createAlert(input: CreateAlertInput): Promise<void> {
  const { level, title, message, dedupeKey, context, dedupeMs = DEFAULT_DEDUPE_MS } = input;

  const cutoff = new Date(Date.now() - dedupeMs);
  const existing = await prisma.alert.findFirst({
    where: {
      dedupeKey,
      acknowledgedAt: null,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.alert.create({
    data: {
      level,
      title,
      message,
      dedupeKey,
      context: context ? (context as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  console.log(`[Alert] ${level}: ${title}`);
}
