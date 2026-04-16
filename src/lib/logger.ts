import { pino } from 'fastify/node_modules/pino/pino.js';

// Re-export fastify's built-in pino for standalone usage
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
