import type { RequestHandler } from 'express';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { createPublicInvitationRateLimitMiddleware } from '../../src/modules/organizations/middleware/public-invitation-rate-limit.middleware.js';
import { createInvitationsAcceptRouter } from '../../src/modules/organizations/organizations.routes.js';
import type { OrganizationsController } from '../../src/modules/organizations/organizations.controller.js';
import { InMemoryRateLimitStore } from '../../src/shared/rate-limit/in-memory-rate-limit.store.js';
import { RedisUnavailableError } from '../../src/shared/rate-limit/rate-limit.errors.js';
import { RateLimiter } from '../../src/shared/rate-limit/rate-limiter.js';
import type { RateLimitStore } from '../../src/shared/rate-limit/rate-limit.store.js';

const TOKEN = 'public-invitation-token-value-1234567890';
const PASSWORD = 'a-strong-password';

const passThrough: RequestHandler = (_req, _res, next) => {
  next();
};

function createApp(limiter: RateLimiter, maxAttempts = 2) {
  const acceptInvitationWithToken = vi.fn((_req: express.Request, res: express.Response) => {
    res.status(200).json({ accepted: true });
  });
  const controller = {
    acceptInvitation: vi.fn(),
    acceptInvitationWithToken,
  } as unknown as OrganizationsController;

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/invitations',
    createInvitationsAcceptRouter({
      controller,
      authenticate: passThrough,
      tenantContext: passThrough,
      userRateLimit: passThrough,
      publicInvitationRateLimit: createPublicInvitationRateLimitMiddleware(
        limiter,
        maxAttempts,
        60,
      ),
    }),
  );
  app.use(errorHandler);

  return { app, acceptInvitationWithToken };
}

function realLimiter(
  limit: number,
  store: RateLimitStore = new InMemoryRateLimitStore(),
): RateLimiter {
  return new RateLimiter({
    store,
    keyPrefix: `http-test-${Math.random().toString(36).slice(2)}`,
    pepper: 'rate-limit-test-pepper',
    failClosed: true,
  });
}

describe('public invitation rate limit over the real public route', () => {
  it('allows requests up to the configured threshold and returns 429 before validation beyond it', async () => {
    const limit = 2;
    const limiter = realLimiter(limit);
    const { app, acceptInvitationWithToken } = createApp(limiter, limit);

    const first = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token: TOKEN, password: PASSWORD });
    const second = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token: TOKEN, password: PASSWORD });
    const third = await request(app).post('/api/v1/invitations/accept-token').send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({ code: 'AUTH_RATE_LIMITED' });
    expect(third.headers['retry-after']).toBeDefined();
    expect(acceptInvitationWithToken).toHaveBeenCalledTimes(limit);
    expect(JSON.stringify(third.body)).not.toContain(TOKEN);
  });

  it('fails closed with 503 AUTH_REDIS_UNAVAILABLE when the store is unavailable', async () => {
    const store = {
      increment: vi.fn().mockRejectedValue(new RedisUnavailableError()),
      getTtl: vi.fn(),
      setMax: vi.fn(),
      delete: vi.fn(),
    } as unknown as RateLimitStore;
    const limiter = realLimiter(2, store);
    const { app, acceptInvitationWithToken } = createApp(limiter);

    const response = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token: TOKEN, password: PASSWORD });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'AUTH_REDIS_UNAVAILABLE' });
    expect(acceptInvitationWithToken).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
  });
});
