import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { authenticationRequiredError } from '../../src/shared/http/authorization.js';
import type { ActorContext, AuthContext } from '../../src/shared/types/actor-context.js';
import { OrganizationsController } from '../../src/modules/organizations/organizations.controller.js';
import {
  createInvitationsAcceptRouter,
  createOrganizationsRouter,
} from '../../src/modules/organizations/organizations.routes.js';
import type { ApiKeyService } from '../../src/modules/organizations/services/api-key.service.js';
import type { InvitationService } from '../../src/modules/organizations/services/invitation.service.js';
import type { MembershipService } from '../../src/modules/organizations/services/membership.service.js';
import type { OrganizationService } from '../../src/modules/organizations/services/organization.service.js';

const AUTH: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  roleHint: 'ADMIN',
  tokenId: 'jti',
};

function createServices() {
  return {
    organizations: {
      listForUser: vi.fn().mockResolvedValue([]),
      getCurrent: vi.fn().mockResolvedValue({ id: AUTH.organizationId, role: 'ADMIN' }),
      update: vi.fn().mockResolvedValue({ id: AUTH.organizationId, role: 'ADMIN' }),
    },
    memberships: {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'membership' }),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    invitations: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'invitation' }),
      revoke: vi.fn().mockResolvedValue(undefined),
      accept: vi
        .fn()
        .mockResolvedValue({ membershipId: 'membership', organizationId: 'org', role: 'ANALYST' }),
      acceptWithToken: vi.fn().mockResolvedValue({
        body: {
          accessToken: 'access',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: { id: 'user', email: 'invitee@example.test', displayName: 'Invitee' },
          activeOrganization: { id: 'org', name: 'Acme', slug: 'acme', role: 'ANALYST' },
        },
        refreshToken: 'refresh-token',
        refreshMaxAgeSeconds: 3600,
        membershipId: 'membership',
        organizationId: 'org',
        role: 'ANALYST',
      }),
    },
    apiKeys: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'key', secret: 'epk_prefix_secret' }),
      revoke: vi.fn().mockResolvedValue(undefined),
      rotate: vi.fn().mockResolvedValue({ id: 'key-2', secret: 'epk_new_secret' }),
    },
  };
}

function createApp(services: ReturnType<typeof createServices>): Express {
  const controller = new OrganizationsController({
    organizations: services.organizations as unknown as OrganizationService,
    memberships: services.memberships as unknown as MembershipService,
    invitations: services.invitations as unknown as InvitationService,
    apiKeys: services.apiKeys as unknown as ApiKeyService,
    cookie: { secure: false },
  });

  const authenticate: RequestHandler = (req, _res, next) => {
    const role = req.header('x-test-role');

    if (role === undefined) {
      next(authenticationRequiredError());
      return;
    }

    const actor: ActorContext = {
      ...AUTH,
      roleHint: role as ActorContext['role'],
      role: role as ActorContext['role'],
      membershipId: 'membership-actor',
    };
    req.auth = actor;
    req.actor = actor;
    next();
  };

  const deps = {
    controller,
    authenticate,
    tenantContext: ((_req, _res, next) => next()) as RequestHandler,
    userRateLimit: ((_req, _res, next) => next()) as RequestHandler,
    publicInvitationRateLimit: ((_req, _res, next) => next()) as RequestHandler,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/organizations', createOrganizationsRouter(deps));
  app.use('/api/v1/invitations', createInvitationsAcceptRouter(deps));
  app.use(errorHandler);

  return app;
}

describe('organizations HTTP routes', () => {
  let services: ReturnType<typeof createServices>;
  let app: Express;

  beforeEach(() => {
    services = createServices();
    app = createApp(services);
  });

  it('rejects unauthenticated access', async () => {
    const response = await request(app).get('/api/v1/organizations/current');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_TOKEN_MISSING');
    expect(services.organizations.getCurrent).not.toHaveBeenCalled();
  });

  it('rejects a role without administrative rights', async () => {
    const response = await request(app)
      .patch('/api/v1/organizations/current')
      .set('x-test-role', 'VIEWER')
      .send({ name: 'New name' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('AUTH_FORBIDDEN');
    expect(services.organizations.update).not.toHaveBeenCalled();
  });

  it('rejects an empty or unknown settings payload', async () => {
    const empty = await request(app)
      .patch('/api/v1/organizations/current')
      .set('x-test-role', 'ADMIN')
      .send({});
    const unknown = await request(app)
      .patch('/api/v1/organizations/current')
      .set('x-test-role', 'ADMIN')
      .send({ isSuperAdmin: true });

    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(services.organizations.update).not.toHaveBeenCalled();
  });

  it('accepts a valid settings update and disables caching', async () => {
    const response = await request(app)
      .patch('/api/v1/organizations/current')
      .set('x-test-role', 'ADMIN')
      .send({ name: 'New name', timezone: 'Europe/Paris', exportRetentionDays: 30 });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(services.organizations.update).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', organizationId: AUTH.organizationId }),
      { name: 'New name', timezone: 'Europe/Paris', exportRetentionDays: 30 },
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });

  it('rejects a malformed membership id', async () => {
    const response = await request(app)
      .delete('/api/v1/organizations/current/members/not-a-uuid')
      .set('x-test-role', 'ADMIN');

    expect(response.status).toBe(400);
    expect(services.memberships.remove).not.toHaveBeenCalled();
  });

  it('rejects duplicate API key scopes', async () => {
    const response = await request(app)
      .post('/api/v1/organizations/current/api-keys')
      .set('x-test-role', 'ADMIN')
      .send({ name: 'Key', scopes: ['ingestion:write', 'ingestion:write'] });

    expect(response.status).toBe(400);
    expect(services.apiKeys.create).not.toHaveBeenCalled();
  });

  it('defaults API key scopes to ingestion:write', async () => {
    const response = await request(app)
      .post('/api/v1/organizations/current/api-keys')
      .set('x-test-role', 'ADMIN')
      .send({ name: 'Ingestion' });

    expect(response.status).toBe(201);
    expect(services.apiKeys.create).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'Ingestion', scopes: ['ingestion:write'] },
      expect.anything(),
    );
  });

  it('requires an authenticated actor but no tenant context to accept an invitation', async () => {
    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set('x-test-role', 'VIEWER')
      .send({ token: 'short' });

    expect(response.status).toBe(400);
    expect(services.invitations.accept).not.toHaveBeenCalled();

    const valid = await request(app)
      .post('/api/v1/invitations/accept')
      .set('x-test-role', 'VIEWER')
      .send({ token: 'a'.repeat(43) });

    expect(valid.status).toBe(200);
    expect(services.invitations.accept).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTH.userId }),
      'a'.repeat(43),
      expect.anything(),
    );
  });

  it('accepts an invitation publicly with a token and sets the refresh cookie', async () => {
    const response = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({
        token: 'a'.repeat(43),
        password: 'a-strong-password',
        displayName: 'Invitee',
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']?.[0]).toContain('ep_rt=refresh-token');
    expect(response.body.data.accessToken).toBe('access');
    expect(services.invitations.acceptWithToken).toHaveBeenCalledWith(
      {
        token: 'a'.repeat(43),
        password: 'a-strong-password',
        displayName: 'Invitee',
      },
      expect.anything(),
    );
  });

  it('rejects a short password on the public acceptance route', async () => {
    const response = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token: 'a'.repeat(43), password: 'short' });

    expect(response.status).toBe(400);
    expect(services.invitations.acceptWithToken).not.toHaveBeenCalled();
  });

  it('parses API key expiry dates and exposes the rotation route', async () => {
    const create = await request(app)
      .post('/api/v1/organizations/current/api-keys')
      .set('x-test-role', 'ADMIN')
      .send({ name: 'Expiring', expiresAt: '2026-12-01T00:00:00.000Z' });

    expect(create.status).toBe(201);
    expect(services.apiKeys.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiresAt: new Date('2026-12-01T00:00:00.000Z') }),
      expect.anything(),
    );

    const rotate = await request(app)
      .post(`/api/v1/organizations/current/api-keys/${AUTH.sessionId}/rotate`)
      .set('x-test-role', 'ADMIN')
      .send({});
    const malformed = await request(app)
      .post('/api/v1/organizations/current/api-keys/not-a-uuid/rotate')
      .set('x-test-role', 'ADMIN')
      .send({});

    expect(rotate.status).toBe(201);
    expect(services.apiKeys.rotate).toHaveBeenCalledWith(
      expect.anything(),
      AUTH.sessionId,
      {},
      expect.anything(),
    );
    expect(malformed.status).toBe(400);
  });
});
