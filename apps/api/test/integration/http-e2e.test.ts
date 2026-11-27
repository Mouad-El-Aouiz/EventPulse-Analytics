import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Membership, Organization, User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { getPrismaClient } from '../../src/database/prisma.js';
import { flushAuthAudits } from '../../src/modules/auth/auth.module.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { hashTokenWithPepper } from '../../src/shared/crypto/token-hash.js';
import { createTestClient } from './helpers/database.js';
import {
  createMembership,
  createOrganization,
  createUser,
  uniqueEmail,
} from './helpers/factories.js';
import { getSharedRedis } from '../../src/shared/redis/redis-connection.js';

const PASSWORD = 'http-e2e-password';
const ORIGIN = 'http://localhost:5173';
const passwords = new PasswordService();
const client = createTestClient();
const app: Express = createApp({ logger: pino({ level: 'silent' }) });

let passwordHash: string;

interface Account {
  organization: Organization;
  user: User;
  membership: Membership;
}

async function createAccount(role: Membership['role'] = 'OWNER'): Promise<Account> {
  const organization = await createOrganization(client);
  const user = await createUser(client);
  const membership = await createMembership(client, organization.id, user.id, role);

  await client.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return { organization, user, membership };
}

async function login(account: Account) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: account.user.email, password: PASSWORD });

  expect(response.status).toBe(200);

  return {
    accessToken: response.body.data.accessToken as string,
    cookie: (response.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '',
  };
}

async function seedInvitation(
  organizationId: string,
  invitedByUserId: string,
  email: string,
  role: Membership['role'] = 'ANALYST',
): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await client.invitation.create({
    data: {
      organizationId,
      email,
      role,
      status: 'PENDING',
      tokenHash: hashTokenWithPepper(token, env.INVITATION_TOKEN_PEPPER),
      invitedByUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return token;
}

beforeAll(async () => {
  passwordHash = await passwords.hash(PASSWORD);
  const redis = getSharedRedis();

  await vi.waitFor(
    () => {
      expect(redis.status).toBe('ready');
    },
    { timeout: 5000 },
  );

  await redis.ping();
});

afterAll(async () => {
  await flushAuthAudits();
  await client.$disconnect();
  await getPrismaClient().$disconnect();
});

describe('HTTP end-to-end', () => {
  it('logs in, reads the active organization, and rejects requests without a valid token', async () => {
    const account = await createAccount();
    const { accessToken } = await login(account);

    const current = await request(app)
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(current.status).toBe(200);
    expect(current.headers['cache-control']).toBe('no-store');
    expect(current.body.data).toMatchObject({
      id: account.organization.id,
      role: 'OWNER',
    });

    const missing = await request(app).get('/api/v1/organizations/current');
    const invalid = await request(app)
      .get('/api/v1/organizations/current')
      .set('Authorization', 'Bearer not-a-valid-token');

    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('AUTH_TOKEN_MISSING');
    expect(invalid.status).toBe(401);
  });

  it('refuses a cross-tenant membership write with a 404 and preserves the target', async () => {
    const first = await createAccount();
    const second = await createAccount();
    const { accessToken } = await login(first);

    const response = await request(app)
      .patch(`/api/v1/organizations/current/members/${second.membership.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('MEMBERSHIP_NOT_FOUND');
    await expect(
      client.membership.findUniqueOrThrow({ where: { id: second.membership.id } }),
    ).resolves.toMatchObject({ role: 'OWNER' });
  });

  it('accepts a public invitation, opens a session in the inviting organization, and rejects replay', async () => {
    const owner = await createAccount();
    const email = uniqueEmail('http-invitee');
    const token = await seedInvitation(owner.organization.id, owner.user.id, email, 'ANALYST');
    const password = 'http-new-invitee-password';

    const accepted = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token, password, displayName: 'HTTP Invitee' });

    expect(accepted.status).toBe(200);
    expect(accepted.headers['set-cookie']?.[0]).toContain('ep_rt=');
    expect(accepted.body.data.activeOrganization).toMatchObject({
      id: owner.organization.id,
      role: 'ANALYST',
    });

    const accessToken = accepted.body.data.accessToken as string;
    const current = await request(app)
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(current.status).toBe(200);
    expect(current.body.data.id).toBe(owner.organization.id);

    const cookie = (accepted.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({});

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).not.toBe(accessToken);

    const replay = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token, password });

    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVITATION_INVALID');

    const user = await client.user.findUniqueOrThrow({ where: { email } });
    expect(await client.session.count({ where: { userId: user.id } })).toBe(2);
  });

  it('never modifies the password of an existing account during public acceptance', async () => {
    const owner = await createAccount();
    const existing = await createUser(client);
    const originalHash = existing.passwordHash;
    await client.user.update({ where: { id: existing.id }, data: { passwordHash } });
    const token = await seedInvitation(owner.organization.id, owner.user.id, existing.email);

    const accepted = await request(app)
      .post('/api/v1/invitations/accept-token')
      .send({ token, password: 'attacker-chosen-password' });

    expect(accepted.status).toBe(200);
    await expect(
      client.user.findUniqueOrThrow({ where: { id: existing.id } }),
    ).resolves.toMatchObject({ passwordHash });
    expect(originalHash).not.toBe(passwordHash);

    const originalLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: existing.email, password: PASSWORD });
    const attackerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: existing.email, password: 'attacker-chosen-password' });

    expect(originalLogin.status).toBe(200);
    expect(attackerLogin.status).toBe(401);
  });

  it('rejects the old token and refresh cookie after a membership is disabled', async () => {
    const owner = await createAccount();
    const viewer = await createAccount('VIEWER');
    await client.membership.update({
      where: { id: viewer.membership.id },
      data: { organizationId: owner.organization.id },
    });
    const ownerLogin = await login(owner);
    const viewerLogin = await login(viewer);

    const removed = await request(app)
      .delete(`/api/v1/organizations/current/members/${viewer.membership.id}`)
      .set('Authorization', `Bearer ${ownerLogin.accessToken}`);

    expect(removed.status).toBe(204);

    const staleAccess = await request(app)
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${viewerLogin.accessToken}`);

    expect(staleAccess.status).toBe(401);
    expect(staleAccess.body.code).toBe('AUTH_SESSION_REVOKED');

    const staleRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', viewerLogin.cookie)
      .send({});

    expect(staleRefresh.status).toBe(401);
    expect(staleRefresh.body.code).toBe('AUTH_SESSION_REVOKED');
    expect(await client.session.count({ where: { userId: viewer.user.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('requires an active membership and organization for every authenticated route', async () => {
    const account = await createAccount();
    const { accessToken } = await login(account);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.activeOrganization.id).toBe(account.organization.id);

    await client.membership.update({
      where: { id: account.membership.id },
      data: { status: 'DISABLED', disabledAt: new Date() },
    });

    const blocked = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('AUTH_NO_ACTIVE_MEMBERSHIP');
  });
});
