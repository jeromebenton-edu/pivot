/**
 * Rate limiting middleware for API routes
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
}

/**
 * Simple in-memory rate limiter
 * For production, use Redis or a database
 */
export function createRateLimiter(config: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
}) {
  return async function rateLimit(identifier: string): Promise<{ success: boolean; message?: string }> {
    const now = Date.now();
    const key = identifier;

    // Clean up expired entries
    Object.keys(store).forEach(k => {
      if (store[k].resetTime < now) {
        delete store[k];
      }
    });

    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      return { success: true };
    }

    if (store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      return { success: true };
    }

    if (store[key].count >= config.max) {
      return {
        success: false,
        message: config.message || `Too many requests. Please try again later.`,
      };
    }

    store[key].count++;
    return { success: true };
  };
}

/**
 * Get client identifier from request
 */
export function getClientIdentifier(request: Request): string {
  // In production, use a better identifier like user ID or API key
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return ip;
}