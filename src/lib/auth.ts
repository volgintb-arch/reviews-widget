import crypto from 'crypto';
import { config } from '../config.js';

export function verifyCredentials(login: string, password: string): boolean {
  const loginMatch = timingSafeEqual(login, config.ADMIN_LOGIN);
  const passwordMatch = timingSafeEqual(password, config.ADMIN_PASSWORD);
  return loginMatch && passwordMatch;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do comparison to prevent timing leak on length
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
