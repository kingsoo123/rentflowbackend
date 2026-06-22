import type { Request } from 'express';

/** Best-effort client IP (respects `trust proxy` when enabled). */
export function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]!.trim();
  }
  const ip = req.ip?.trim();
  if (ip) {
    return ip;
  }
  return req.socket.remoteAddress?.trim() || 'unknown';
}
