import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { tokenMissingError } from '../../src/modules/auth/auth.errors.js';
import { createAuthRouter } from '../../src/modules/auth/auth.routes.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuthContext } from '../../src/shared/types/actor-context.js';
import { assertAllowedOrigin, parseAllowedOrigins } from '../../src/shared/http/origin.js';

const ORIGIN = 'https://app.example';
const ALLOWED_ORIGINS = [ORIGIN];
const AUTH: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  roleHint: 'OWNER',
  tokenId: 'jti',
};

const ORGANIZATION = {
  id: AUTH.organizationId,
  name: 'Acme Events',
  slug: 'acme-events',
  role: 'OWNER' as const,
};

const USER = {
  id: AUTH.userId,
  email: 'user@example.com',
  displayName: 'User Example',
};

const AUTH_BODY = {
  accessToken: 'access-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: USER,
  activeOrganization: ORGANIZATION,
};

function createServiceMock() {
  return {
    login: vi.fn().mockResolvedValue({
      body: AUTH_BODY,
      refreshToken: 'refresh-token',
      refreshMaxAgeSeconds: 604_800,
    }),
    refresh: vi.fn().mockResolvedValue({
      body: AUTH_BODY,
      refreshToken: 'rotated-refresh-token',
      refreshMaxAgeSeconds: 604_800,
    }),
    logout: vi.fn().mockResolvedValue({ revokedCurrentSession: true }),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue({
      user: USER,
      activeOrganization: ORGANIZATION,
      organizations: [ORGANIZATION],
    }),
    listSessions: vi.fn().mockResolvedValue([
      {
        id: AUTH.sessionId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        expiresAt: new Date('2026-01-08T00:00:00.000Z'),
        absoluteExpiresAt: new Date('2026-01-31T00:00:00.000Z'),
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        current: true,
      },
    ]),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    switchOrganization: vi.fn().mockResolvedValue({
      body: AUTH_BODY,
      refreshToken: 'switched-refresh-token',
      refreshMaxAgeSeconds: 604_800,
    }),
    forgotPassword: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
  };
}

function createApp(service: ReturnType<typeof createServiceMock>): Express {
  const controller = new AuthController({
    service: service as unknown as AuthService,
    allowedOrigins: parseAllowedOrigins(ALLOWED_ORIGINS.join(',')),
    cookie: { secure: true },
  });

  const authenticate: RequestHandler = (req, _res, next) => {
    if (req.get('authorization') !== 'Bearer test-token') {
      next(tokenMissingError());
      return;
    }

    req.auth = AUTH;
    req.actor = {
      ...AUTH,
      membershipId: '44444444-4444-4444-8444-444444444444',
      role: AUTH.roleHint,
    };
    next();
  };

  const optionalAuthenticate: RequestHandler = (req, _res, next) => {
    if (req.get('authorization') === 'Bearer test-token') {
      req.auth = AUTH;
    }

    next();
  };

  const requireOrigin: RequestHandler = (req, _res, next) => {
    try {
      assertAllowedOrigin(req, ALLOWED_ORIGINS);
      next();
    } catch (error) {
      next(error);
    }
  };

  const app = express();

  app.use(cookieParser());
  app.use(express.json());
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      controller,
      authenticate,
      optionalAuthenticate,
      tenantContext: (_req, _res, next) => next(),
      requireOrigin,
      userRateLimit: (_req, _res, next) => next(),
    }),
  );
  app.use(errorHandler);

  return app;
}

function expectNoStore(response: request.Response): void {
  expect(response.headers['cache-control']).toBe('no-store');
}

function expectRefreshCookie(response: request.Response, value: string): void {
  const header = response.headers['set-cookie'];

  expect(header).toBeDefined();

  const cookie = Array.isArray(header) ? header[0] : header;

  expect(cookie).toContain(`ep_rt=${value}`);
  expect(cookie).toContain('Path=/api/v1/auth');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Secure');
}

describe('auth HTTP routes', () => {
  let service: ReturnType<typeof createServiceMock>;
  let app: Express;

  beforeEach(() => {
    service = createServiceMock();
    app = createApp(service);
  });

  it('POST /login returns a token response and sets a scoped refresh cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'vitest')
      .send({ email: 'User@Example.com', password: 'secret' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: AUTH_BODY });
    expectNoStore(response);
    expect(service.login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret',
      organizationId: undefined,
      ipAddress: expect.any(String),
      userAgent: 'vitest',
    });
    expectRefreshCookie(response, 'refresh-token');
    expect(JSON.stringify(response.body)).not.toContain('refresh-token');
  });

  it('POST /login validates the body and never calls the service on errors', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'secret', extra: true });

    expect(response.status).toBe(400);
    expect(service.login).not.toHaveBeenCalled();
  });

  it('POST /refresh requires an allowed origin and the refresh cookie', async () => {
    const missingOrigin = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'ep_rt=refresh-token')
      .send({});

    expect(missingOrigin.status).toBe(403);
    expect(missingOrigin.body).toMatchObject({ code: 'AUTH_ORIGIN_FORBIDDEN' });
    expect(service.refresh).not.toHaveBeenCalled();

    const missingCookie = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .send({});

    expect(missingCookie.status).toBe(401);
    expect(missingCookie.body).toMatchObject({ code: 'AUTH_TOKEN_MISSING' });

    const success = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', 'ep_rt=refresh-token')
      .send({});

    expect(success.status).toBe(200);
    expectNoStore(success);
    expect(service.refresh).toHaveBeenCalledWith('refresh-token', expect.any(Object));
    expectRefreshCookie(success, 'rotated-refresh-token');
  });

  it('POST /refresh rejects a non-empty body', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', 'ep_rt=refresh-token')
      .send({ unexpected: true });

    expect(response.status).toBe(400);
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('POST /logout with a bearer token clears the cookie without requiring an origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(204);
    expect(service.logout).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: AUTH.sessionId }),
      undefined,
      expect.any(Object),
    );
    expectRefreshCookie(response, '');
  });

  it('POST /logout without a bearer token enforces the origin allowlist', async () => {
    const denied = await request(app).post('/api/v1/auth/logout').send({});

    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'AUTH_ORIGIN_FORBIDDEN' });
    expect(service.logout).not.toHaveBeenCalled();

    const allowed = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', 'ep_rt=refresh-token')
      .send({});

    expect(allowed.status).toBe(204);
    expect(service.logout).toHaveBeenCalledWith(undefined, 'refresh-token', expect.any(Object));
  });

  it('POST /logout-all requires authentication', async () => {
    const denied = await request(app).post('/api/v1/auth/logout-all').send({});

    expect(denied.status).toBe(401);
    expect(denied.body).toMatchObject({ code: 'AUTH_TOKEN_MISSING' });

    const success = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(success.status).toBe(204);
    expect(service.logoutAll).toHaveBeenCalledTimes(1);
  });

  it('GET /me and GET /sessions return the current identity and bounded sessions', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer test-token');

    expect(me.status).toBe(200);
    expectNoStore(me);
    expect(me.body.data.user).toEqual(USER);
    expect(JSON.stringify(me.body)).not.toContain('access-token');

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer test-token');

    expect(sessions.status).toBe(200);
    expectNoStore(sessions);
    expect(sessions.body.data).toHaveLength(1);
    expect(sessions.body.data[0]).toMatchObject({ id: AUTH.sessionId, current: true });
    expect(JSON.stringify(sessions.body)).not.toContain('refresh-token');
  });

  it('DELETE /sessions/:id validates the id and clears the cookie for the current session', async () => {
    const invalid = await request(app)
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set('Authorization', 'Bearer test-token');

    expect(invalid.status).toBe(400);
    expect(service.revokeSession).not.toHaveBeenCalled();

    const current = await request(app)
      .delete(`/api/v1/auth/sessions/${AUTH.sessionId}`)
      .set('Authorization', 'Bearer test-token');

    expect(current.status).toBe(204);
    expect(service.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: AUTH.sessionId }),
      AUTH.sessionId,
      expect.any(Object),
    );
    expectRefreshCookie(current, '');
  });

  it('POST /switch-organization issues a new refresh cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', 'Bearer test-token')
      .send({ organizationId: AUTH.organizationId });

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(service.switchOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: AUTH.sessionId }),
      AUTH.organizationId,
      expect.any(Object),
    );
    expectRefreshCookie(response, 'switched-refresh-token');
  });

  it('password forgot and reset return 204 and never echo secrets', async () => {
    const forgot = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'USER@example.com' });

    expect(forgot.status).toBe(204);
    expectNoStore(forgot);
    expect(service.forgotPassword).toHaveBeenCalledWith('user@example.com', expect.any(Object));

    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: 'x'.repeat(32), newPassword: 'a-new-strong-password' });

    expect(reset.status).toBe(204);
    expectNoStore(reset);
    expect(service.resetPassword).toHaveBeenCalledWith(
      'x'.repeat(32),
      'a-new-strong-password',
      expect.any(Object),
    );
    expect(reset.text).not.toContain('a-new-strong-password');
  });

  it('does not expose internal errors as stack traces', async () => {
    service.me.mockRejectedValueOnce(new Error('prisma connection string postgresql://secret'));

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('postgresql://secret');
    expect(response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
