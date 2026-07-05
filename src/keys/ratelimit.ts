/**
 * In-memory fixed-window rate limiter, scoped per API key id.
 *
 * Each key gets a 60-second window. The window is anchored to the first
 * request in the current minute (lazy start), so a quiet key never wastes
 * budget. When the window expires, the counter resets. This is the simplest
 * correct per-key RPM strategy: no background timers, no shared state, and the
 * reset is implicit when the next request arrives past `windowEnd`.
 *
 * Counters live only in memory, so they reset on restart. For anti-abuse that
 * is fine: a restart is a natural circuit-breaker and the attacker still can't
 * exceed `rpm` for any sustained window.
 */

interface WindowState {
  /** Start of the current 60s window (epoch ms). */
  windowStart: number;
  /** Requests counted in the current window. */
  count: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Max requests per minute for this key. */
  limit: number;
  /** Requests remaining in the current window (>= 0). */
  remaining: number;
  /** Seconds until the current window resets (>= 1). */
  retryAfter: number;
}

const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly windows = new Map<string, WindowState>();
  private readonly defaultRpm: number;

  constructor(defaultRpm: number) {
    if (!Number.isInteger(defaultRpm) || defaultRpm <= 0) {
      throw new Error(`defaultRpm must be a positive integer, got ${defaultRpm}`);
    }
    this.defaultRpm = defaultRpm;
  }

  /**
   * Records one request for `keyId` and decides whether it's allowed.
   * `rpmOverride` (from the key record) wins over the global default.
   */
  check(keyId: string, rpmOverride: number | null): RateLimitResult {
    const limit = rpmOverride && rpmOverride > 0 ? rpmOverride : this.defaultRpm;
    const now = Date.now();
    let win = this.windows.get(keyId);

    if (!win || now >= win.windowStart + WINDOW_MS) {
      // Start a fresh window anchored to `now`.
      win = { windowStart: now, count: 0 };
      this.windows.set(keyId, win);
    }

    win.count++;
    const allowed = win.count <= limit;
    const remaining = Math.max(0, limit - win.count);
    const windowEnd = win.windowStart + WINDOW_MS;
    const retryAfter = Math.max(1, Math.ceil((windowEnd - now) / 1000));

    return { allowed, limit, remaining, retryAfter };
  }

  /** Drops all windows. Intended for tests / explicit reset. */
  reset(): void {
    this.windows.clear();
  }

  /** Number of keys currently tracked. Intended for tests / observability. */
  size(): number {
    return this.windows.size;
  }
}
