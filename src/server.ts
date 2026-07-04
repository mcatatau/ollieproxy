import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { chatRoutes } from './routes/chat.js';
import { modelsRoutes } from './routes/models.js';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: config.bodyLimitBytes });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/v1/health', async () => ({ status: 'ok' }));

  await app.register(modelsRoutes);
  await app.register(chatRoutes);

  return app;
}
