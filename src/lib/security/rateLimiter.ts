interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const localRateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale IP entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of localRateLimitStore.entries()) {
      if (now > entry.resetAt) {
        localRateLimitStore.delete(ip);
      }
    }
  }, 300000);
}

/**
 * Extracts client IP address from Vercel Edge Proxy headers according to Vercel documentation.
 * Primary rate-limiting protection MUST be enforced at infrastructure level via Vercel WAF or Vercel KV / Upstash Redis.
 * Hierarchy:
 * 1. x-vercel-forwarded-for (Injected by Vercel Edge Network per platform documentation).
 * 2. x-real-ip (Injected by Vercel Edge Proxy).
 * 3. x-forwarded-for (First IP element).
 * 4. Fallback '127.0.0.1'.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // 1. Vercel Edge Network Header
  const xVercelForwardedFor = headers.get('x-vercel-forwarded-for');
  if (xVercelForwardedFor && xVercelForwardedFor.trim()) {
    return xVercelForwardedFor.split(',')[0].trim();
  }

  // 2. Real IP Header
  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  // 3. Standard X-Forwarded-For Header (First IP)
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor && xForwardedFor.trim()) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  // 4. Fallback for local development / testing
  return '127.0.0.1';
}

/**
 * Distributed (Vercel KV / Upstash Redis) + Edge Memory Fallback Rate Limiter per IP address.
 * Default: limit = 5 uploads per windowMs = 60,000 ms (1 minute).
 */
export async function checkRateLimit(
  ip: string,
  limit: number = 5,
  windowMs: number = 60000,
  prefix: string = 'rate'
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  // Option A: Distributed Rate Limiting via Vercel KV / Upstash Redis REST API (if configured in production)
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const key = `ratelimit:${prefix}:${ip}`;
      // Execute INCR via REST API
      const res = await fetch(`${kvUrl}/incr/${key}`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      const data = await res.json();
      const currentCount = typeof data.result === 'number' ? data.result : 1;

      // Set EXPIRE if key created first time
      if (currentCount === 1) {
        await fetch(`${kvUrl}/expire/${key}/${Math.ceil(windowMs / 1000)}`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
      }

      if (currentCount > limit) {
        return {
          allowed: false,
          remaining: 0,
          resetSeconds: Math.ceil(windowMs / 1000),
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, limit - currentCount),
        resetSeconds: Math.ceil(windowMs / 1000),
      };
    } catch (err) {
      console.warn('Distributed KV RateLimiter error, falling back to edge memory:', err);
    }
  }

  // Option B: Secondary Edge Memory Defense (Default fallback & local dev)
  const now = Date.now();
  let entry = localRateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    localRateLimitStore.set(ip, entry);
    return {
      allowed: true,
      remaining: limit - 1,
      resetSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (entry.count >= limit) {
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: resetSeconds > 0 ? resetSeconds : 1,
    };
  }

  entry.count += 1;
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetSeconds: resetSeconds > 0 ? resetSeconds : 1,
  };
}
