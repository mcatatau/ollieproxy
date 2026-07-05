import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { chatRoutes } from './routes/chat.js';
import { modelsRoutes } from './routes/models.js';
import { installAuth } from './keys/plugin.js';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: config.bodyLimitBytes });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/v1/health', async () => ({ status: 'ok' }));

  // API-key auth + per-key RPM rate limiting, opt-in via AUTH_ENABLED=1.
  // Attached as a root-level preHandler (not an encapsulated plugin) so it
  // guards every route registered afterwards, including /v1/models.
  if (config.auth.enabled) {
    await installAuth(app);
  }

  await app.register(modelsRoutes);
  await app.register(chatRoutes);

  return app;
}
