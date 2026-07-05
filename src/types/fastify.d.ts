import { FastifyRequest } from 'fastify';

/**
 * Set by the auth plugin on verified requests: the id of the API key used.
 * Available to route handlers for logging/observability.
 */
declare module 'fastify' {
  interface FastifyRequest {
    keyId?: string;
  }
}

export {};
