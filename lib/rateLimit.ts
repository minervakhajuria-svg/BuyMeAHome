/**
 * Fixed-window in-memory rate limiter. It is per server instance: good enough to blunt abuse of a
 * small friends-and-family launch, but on serverless hosting each instance counts separately. Put
 * a shared limiter (e.g. a Supabase table or a platform firewall rule) in front before a public launch.
 */
const g = globalThis as unknown as { __rate?: Map<string, { count: number; resetAt: number }> };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
  const hits = (g.__rate ??= new Map());
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const hit = hits.get(key);
  if (!hit || hit.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  hit.count++;
  return { ok: hit.count <= limit, retryAfterSeconds: Math.ceil((hit.resetAt - now) / 1000) };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
