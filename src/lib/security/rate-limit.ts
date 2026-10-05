interface Bucket {
  count: number;
  resetAt: number;
}

const globalStore = globalThis as unknown as {
  __rateLimitBuckets?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> =
  globalStore.__rateLimitBuckets ?? (globalStore.__rateLimitBuckets = new Map());

const MAX_BUCKETS = 10000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return checkLimit(key, limit, windowMs, true);
}

export function checkLimit(
  key: string,
  limit: number,
  windowMs: number,
  record: boolean,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (record) buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (record) existing.count += 1;

  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: 0,
  };
}

export function clearLimit(key: string): void {
  buckets.delete(key);
}

export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };

  if (!result.ok) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * The client identity a rate-limit bucket is keyed on.
 *
 * `x-forwarded-for` is **append-only**: a proxy adds the address it saw to the end
 * of whatever the client already sent. So the list arrives as
 * `"<anything the client chose>, <real client ip>"`, and element `[0]` is the
 * attacker-controlled part. Reading it meant an attacker could send a fresh
 * `X-Forwarded-For` per request and get a fresh bucket every time — measured at 12
 * consecutive guesses against the password-only admin gate with no lockout at all,
 * and the same against the login route's per-IP bucket.
 *
 * The rightmost entry is the one the nearest trusted proxy appended, so that is
 * what is used. `x-real-ip` is the next best, as an edge that rewrites rather
 * than appends sets only that.
 *
 * The honest limitation: this is only trustworthy *behind* a proxy that appends.
 * With no proxy in front the header is whatever the client typed, and no choice of
 * element is safe — the limiter then degrades to one shared bucket, which is
 * noisy but fails closed. A multi-instance deployment still needs this in the
 * database or a shared cache, because the buckets are per-process.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // rightmost, not leftmost — see above
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

export function clientKey(request: Request, scope: string): string {
  return `${scope}:${clientIp(request)}`;
}
