function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const config = {
  port: intEnv('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  upstreamUrl: process.env.UPSTREAM_URL || 'https://olliechat-sw02.onrender.com',
  /** Upstream request timeout in milliseconds. */
  upstreamTimeoutMs: intEnv('UPSTREAM_TIMEOUT_MS', 120_000),
  /** Maximum request body size in bytes (Fastify `bodyLimit`). */
  bodyLimitBytes: intEnv('BODY_LIMIT_BYTES', 4 * 1024 * 1024),
} as const;
