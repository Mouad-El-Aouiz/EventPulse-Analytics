import type { Express } from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Membership, Organization, User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { getPrismaClient } from '../../src/database/prisma.js';
import { flushAuthAudits } from '../../src/modules/auth/auth.module.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { encodeCursor } from '../../src/shared/http/cursor.js';
import { createTestClient } from './helpers/database.js';
import { createMembership, createOrganization, createUser, unique } from './helpers/factories.js';

const PASSWORD = 'audit-logs-password';
const passwords = new PasswordService();
const client = createTestClient();
const app: Express = createApp({ logger: pino({ level: 'silent' }) });

let passwordHash: string;

interface Account {
  organization: Organization;
  user: User;
  membership: Membership;
}

async function createAccount(role: Membership['role']): Promise<Account> {
  const organization = await createOrganization(client);
  const user = await createUser(client);
  const membership = await createMembership(client, organization.id, user.id, role);

  await client.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { organization, user, membership };
}

async function login(account: Account): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: account.user.email, password: PASSWORD });

  expect(response.status).toBe(200);

  return response.body.data.accessToken as string;
}

function auditLogData(overrides: {
  organizationId: string;
  actorUserId?: string | null;
  category?: 'AUTH' | 'USERS_ROLES' | 'ORGANIZATION' | 'SENSITIVE_DATA' | 'FINANCIAL' | 'INGESTION';
  actionType: string;
  resourceType?: string;
  resourceId?: string | null;
  result?: 'SUCCESS' | 'FAILURE';
  metadata?: unknown;
  createdAt?: Date;
}) {
  return {
    organizationId: overrides.organizationId,
    category: overrides.category ?? ('AUTH' as const),
    actorUserId: overrides.actorUserId ?? null,
    actionType: overrides.actionType,
    resourceType: overrides.resourceType ?? 'test',
    resourceId: overrides.resourceId ?? null,
    result: overrides.result ?? ('SUCCESS' as const),
    metadata: (overrides.metadata ?? {}) as never,
    createdAt: overrides.createdAt,
  };
}

beforeAll(async () => {
  passwordHash = await passwords.hash(PASSWORD);
});

afterAll(async () => {
  await flushAuthAudits();
  await client.$disconnect();
  await getPrismaClient().$disconnect();
});

describe('Audit Logs API', () => {
  it('requires authentication and restricts access to OWNER and ADMIN', async () => {
    const anonymous = await request(app).get('/api/v1/audit-logs');

    expect(anonymous.status).toBe(401);

    for (const role of ['EVENT_MANAGER', 'ANALYST', 'VIEWER'] as const) {
      const account = await createAccount(role);
      const accessToken = await login(account);
      const response = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
    }

    for (const role of ['OWNER', 'ADMIN'] as const) {
      const account = await createAccount(role);
      const accessToken = await login(account);
      const response = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('lists only tenant logs, newest first, with filters and redacted metadata', async () => {
    const account = await createAccount('OWNER');
    const other = await createAccount('OWNER');
    const accessToken = await login(account);
    const actionType = unique('AUDIT_FILTER');
    const ownLog = await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actorUserId: account.user.id,
        actionType,
        category: 'FINANCIAL',
        metadata: {
          password: 'super-secret',
          nested: { token: 'invitation-token', safe: 'visible' },
        },
      }),
    });
    await client.auditLog.create({
      data: auditLogData({
        organizationId: other.organization.id,
        actionType,
      }),
    });

    const response = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, category: 'FINANCIAL', result: 'SUCCESS' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: ownLog.id,
      actionType,
      category: 'FINANCIAL',
      result: 'SUCCESS',
      actorUserId: account.user.id,
    });
    expect(response.body.data[0].metadata).toEqual({
      password: '[REDACTED]',
      nested: { token: '[REDACTED]', safe: 'visible' },
    });
    expect(JSON.stringify(response.body)).not.toContain('super-secret');
    expect(JSON.stringify(response.body)).not.toContain('invitation-token');
  });

  it('applies date, resource and actor filters deterministically', async () => {
    const account = await createAccount('ADMIN');
    const accessToken = await login(account);
    const actionType = unique('AUDIT_RANGE');
    const resourceId = unique('resource');
    const january = new Date('2026-01-10T00:00:00.000Z');
    const february = new Date('2026-02-10T00:00:00.000Z');

    await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actorUserId: account.user.id,
        actionType,
        resourceType: 'widget',
        resourceId,
        createdAt: january,
      }),
    });
    const match = await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actorUserId: account.user.id,
        actionType,
        resourceType: 'widget',
        resourceId,
        createdAt: february,
      }),
    });

    const response = await request(app)
      .get('/api/v1/audit-logs')
      .query({
        actionType,
        resourceType: 'widget',
        resourceId,
        actorUserId: account.user.id,
        from: '2026-01-15T00:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((log: { id: string }) => log.id)).toEqual([match.id]);
  });

  it('paginates with a stable cursor and a UUID tiebreaker', async () => {
    const account = await createAccount('OWNER');
    const accessToken = await login(account);
    const actionType = unique('AUDIT_PAGE');
    const createdAt = new Date('2026-03-01T12:00:00.000Z');
    const created = await Promise.all(
      [0, 1, 2, 3, 4].map(() =>
        client.auditLog.create({
          data: auditLogData({
            organizationId: account.organization.id,
            actionType,
            createdAt,
          }),
        }),
      ),
    );
    const expected = created
      .map((log) => log.id)
      .sort()
      .reverse();

    const first = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, limit: 2 })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(first.status).toBe(200);
    expect(first.body.meta).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(first.body.data.map((log: { id: string }) => log.id)).toEqual(expected.slice(0, 2));

    const second = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, limit: 2, cursor: first.body.meta.nextCursor })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(second.status).toBe(200);
    expect(second.body.data.map((log: { id: string }) => log.id)).toEqual(expected.slice(2, 4));

    const third = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, limit: 2, cursor: second.body.meta.nextCursor })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(third.status).toBe(200);
    expect(third.body.data.map((log: { id: string }) => log.id)).toEqual(expected.slice(4));
    expect(third.body.meta).toEqual({ limit: 2, hasMore: false, nextCursor: null });
  });

  it('rejects page limits outside the contract and tenant overrides in query', async () => {
    const account = await createAccount('OWNER');
    const accessToken = await login(account);

    for (const limit of ['0', '101', '1.5', 'not-a-number']) {
      const response = await request(app)
        .get('/api/v1/audit-logs')
        .query({ limit })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    }

    const tenantOverride = await request(app)
      .get('/api/v1/audit-logs')
      .query({ organizationId: account.organization.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(tenantOverride.status).toBe(400);
  });

  it('returns a tenant-scoped detail and hides cross-tenant logs', async () => {
    const account = await createAccount('OWNER');
    const other = await createAccount('OWNER');
    const accessToken = await login(account);
    const ownLog = await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actionType: unique('AUDIT_DETAIL'),
        metadata: { apiKey: 'key-secret', safe: 'kept' },
      }),
    });
    const otherLog = await client.auditLog.create({
      data: auditLogData({
        organizationId: other.organization.id,
        actionType: unique('AUDIT_DETAIL'),
      }),
    });

    const own = await request(app)
      .get(`/api/v1/audit-logs/${ownLog.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const foreign = await request(app)
      .get(`/api/v1/audit-logs/${otherLog.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const missing = await request(app)
      .get('/api/v1/audit-logs/99999999-9999-4999-8999-999999999999')
      .set('Authorization', `Bearer ${accessToken}`);
    const invalid = await request(app)
      .get('/api/v1/audit-logs/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(ownLog.id);
    expect(own.body.data.metadata).toEqual({ apiKey: '[REDACTED]', safe: 'kept' });
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('AUDIT_LOG_NOT_FOUND');
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });

  it('keeps cursors and foreign identifiers inside the active tenant', async () => {
    const account = await createAccount('OWNER');
    const other = await createAccount('OWNER');
    const accessToken = await login(account);
    const actionType = unique('AUDIT_TENANT_SCOPE');
    const resourceId = unique('shared-resource');
    const ownLog = await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actorUserId: account.user.id,
        actionType,
        resourceId,
      }),
    });
    const foreignLog = await client.auditLog.create({
      data: auditLogData({
        organizationId: other.organization.id,
        actorUserId: other.user.id,
        actionType,
        resourceId,
      }),
    });

    const byResource = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, resourceId })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(byResource.status).toBe(200);
    expect(byResource.body.data.map((log: { id: string }) => log.id)).toEqual([ownLog.id]);

    const byForeignActor = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType, actorUserId: other.user.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(byForeignActor.status).toBe(200);
    expect(byForeignActor.body.data).toHaveLength(0);

    const foreignCursor = encodeCursor(foreignLog.createdAt, foreignLog.id);
    const viaForeignCursor = await request(app)
      .get('/api/v1/audit-logs')
      .query({ cursor: foreignCursor, limit: 100 })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(viaForeignCursor.status).toBe(200);
    expect(viaForeignCursor.body.data.map((log: { id: string }) => log.id)).not.toContain(
      foreignLog.id,
    );
  });

  it('rejects invalid cursors, date ranges and unsupported filters', async () => {
    const account = await createAccount('OWNER');
    const accessToken = await login(account);

    const invalidCursor = await request(app)
      .get('/api/v1/audit-logs')
      .query({ cursor: 'not-a-cursor' })
      .set('Authorization', `Bearer ${accessToken}`);
    const invalidRange = await request(app)
      .get('/api/v1/audit-logs')
      .query({ from: '2026-03-02T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' })
      .set('Authorization', `Bearer ${accessToken}`);
    const invalidCategory = await request(app)
      .get('/api/v1/audit-logs')
      .query({ category: 'UNKNOWN' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(invalidCursor.status).toBe(400);
    expect(invalidCursor.body.code).toBe('CURSOR_INVALID');
    expect(invalidRange.status).toBe(400);
    expect(invalidCategory.status).toBe(400);
  });

  it('exposes no HTTP mutation surface for audit entries', async () => {
    const account = await createAccount('OWNER');
    const accessToken = await login(account);
    const log = await client.auditLog.create({
      data: auditLogData({
        organizationId: account.organization.id,
        actionType: unique('AUDIT_IMMUTABLE'),
        metadata: { safe: 'kept' },
      }),
    });

    for (const method of ['patch', 'put', 'delete'] as const) {
      const response = await request(app)
        [method](`/api/v1/audit-logs/${log.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ metadata: { tampered: true } });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    }

    const create = await request(app)
      .post('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ actionType: 'FORGED' });

    expect(create.status).toBe(404);

    const unchanged = await client.auditLog.findUniqueOrThrow({ where: { id: log.id } });

    expect(unchanged.metadata).toEqual({ safe: 'kept' });
  });
});
