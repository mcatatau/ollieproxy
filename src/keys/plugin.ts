import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { KeyStore } from './store.js';
import { KeyAuth } from './auth.js';
import { RateLimiter } from './ratelimit.js';

/**
 * Installs API-key auth + per-key RPM rate limiting as a root-level
 * `preHandler` on `app`, so it guards every route registered afterwards
 * (including `/v1/models`). Mounted only when `AUTH_ENABLED=1`.
 *
 * On a denied request it sends a 401/429 JSON body shaped like OpenAI's error
 * envelope and sets `Retry-After` for rate-limited responses. Health-check
 * routes (`/health`, `/v1/health`) are exempt so liveness probes still work
 * without a key.
 */

const EXEMPT_PATHS = new Set(['/health', '/v1/health']);

export async function installAuth(app: FastifyInstance) {
  const store = new KeyStore(config.auth.keysFile);
  const auth = new KeyAuth(store);
  const limiter = new RateLimiter(config.auth.defaultRpm);

  // Prime the in-memory cache once at startup so the first request doesn't pay
  // a stat+read on the hot path.
  await auth.refresh();

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (EXEMPT_PATHS.has(request.url.split('?')[0])) return;

    const authHeader =
      (request.headers['authorization'] as string | undefined) ??
      (request.headers['Authorization'] as string | undefined);

    const result = await auth.verify(authHeader);
    if (!result.ok || !result.record) {
      return deny(reply, 401, result.reason ?? 'invalid');
    }

    const rec = result.record;
    const rl = limiter.check(rec.id, rec.rpm);
    reply.header('X-RateLimit-Limit', String(rl.limit));
    reply.header('X-RateLimit-Remaining', String(rl.remaining));
    reply.header('X-RateLimit-Reset', String(rl.retryAfter));

    if (!rl.allowed) {
      return deny(reply, 429, 'rate_limited', rl.retryAfter);
    }

    // Stash the verified key id for logging/observability downstream.
    request.keyId = rec.id;
  });
}

/** Sends an OpenAI-style error response. */
function deny(
  reply: FastifyReply,
  status: number,
  reason: string,
  retryAfter?: number,
): FastifyReply {
  const messages: Record<string, string> = {
    missing: 'Missing API key. Provide `Authorization: Bearer <key>`.',
    malformed: 'Malformed `Authorization` header. Expected `Bearer <key>`.',
    invalid: 'Invalid or revoked API key.',
    rate_limited: 'Rate limit exceeded. Try again shortly.',
  };
  if (retryAfter !== undefined) reply.header('Retry-After', String(retryAfter));
  return reply.status(status).send({
    error: {
      message: messages[reason] ?? 'Unauthorized.',
      type: status === 429 ? 'rate_limit_error' : 'authentication_error',
      code: status,
    },
  });
}
