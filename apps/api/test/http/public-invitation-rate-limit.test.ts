import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { createPublicInvitationRateLimitMiddleware } from '../../src/modules/organizations/middleware/public-invitation-rate-limit.middleware.js';
import type { RateLimiter } from '../../src/shared/rate-limit/rate-limiter.js';

function createApp(limiter: RateLimiter) {
  const app = express();
  app.use(express.json());
  app.post(
    '/accept-token',
    createPublicInvitationRateLimitMiddleware(limiter, 3, 60),
    (_req, res) => {
      res.status(204).end();
    },
  );
  app.use(errorHandler);

  return app;
}

describe('public invitation rate limit middleware', () => {
  it('allows requests under the limit and rejects the next one per IP', async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const app = createApp({ consume } as unknown as RateLimiter);

    await expect(request(app).post('/accept-token').send({})).resolves.toMatchObject({
      status: 204,
    });
    await expect(request(app).post('/accept-token').send({})).resolves.toMatchObject({
      status: 429,
    });

    expect(consume).toHaveBeenCalledWith('invitation-accept-ip', [expect.any(String)], 3, 60);
  });
});
