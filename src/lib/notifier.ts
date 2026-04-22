import { config } from '../config.js';

const lastSentByKey = new Map<string, number>();
const DEFAULT_DEDUPE_MS = 6 * 60 * 60 * 1000; // 6h

export interface NotifyOptions {
  // Dedupe key: same key suppressed within `dedupeMs`.
  key: string;
  dedupeMs?: number;
  // Force-send regardless of dedupe window.
  force?: boolean;
}

export async function notify(text: string, opts: NotifyOptions): Promise<void> {
  const token = config.TELEGRAM_BOT_TOKEN;
  const chatId = config.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[Notify] (telegram not configured)', text);
    return;
  }

  const now = Date.now();
  const lastSent = lastSentByKey.get(opts.key) ?? 0;
  const window = opts.dedupeMs ?? DEFAULT_DEDUPE_MS;
  if (!opts.force && now - lastSent < window) {
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Notify] telegram ${res.status}: ${body}`);
      return;
    }
    lastSentByKey.set(opts.key, now);
  } catch (err) {
    console.error('[Notify] telegram send failed:', err instanceof Error ? err.message : err);
  }
}
