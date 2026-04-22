import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3010),
  DATABASE_URL: z.string().url(),
  ADMIN_LOGIN: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),
  TWOGIS_PUBLIC_KEY: z.string().min(1),
  TWOGIS_API_BASE: z.string().url().default('https://public-api.reviews.2gis.com/3.0'),
  YANDEX_WIDGET_BASE: z.string().url().default('https://yandex.ru/maps-reviews-widget'),
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',').map(o => o.trim()).filter(Boolean)),
  PUBLIC_API_BASE: z.string().url().default('https://reviews.questlegends.ru'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
