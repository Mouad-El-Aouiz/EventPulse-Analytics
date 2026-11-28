import type { AuditLog } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AuditLogService } from '../../../src/modules/audit-logs/audit-log.service.js';
import type { AuditLogRepository } from '../../../src/modules/audit-logs/audit-log.repository.js';
import type { ActorContext } from '../../../src/shared/types/actor-context.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const AUDIT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR: ActorContext = {
  userId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  organizationId: ORGANIZATION_ID,
  roleHint: 'OWNER',
  tokenId: '55555555-5555-4555-8555-555555555555',
  membershipId: '66666666-6666-4666-8666-666666666666',
  role: 'OWNER',
};

function auditLog(metadata: unknown): AuditLog {
  return {
    id: AUDIT_ID,
    organizationId: ORGANIZATION_ID,
    category: 'AUTH',
    actorUserId: ACTOR.userId,
    actionType: 'LOGIN',
    resourceType: 'session',
    resourceId: null,
    result: 'SUCCESS',
    metadata,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as AuditLog;
}

function createService(rows: AuditLog[]) {
  const repository = {
    list: async () => rows,
    findById: async () => rows[0] ?? null,
  } as unknown as AuditLogRepository;

  return new AuditLogService(repository);
}

describe('AuditLogService metadata privacy', () => {
  it('redacts secret-like keys recursively without dropping audit fields', async () => {
    const service = createService([
      auditLog({
        password: 'plain-text',
        nested: { apiKey: 'secret', cookie: 'ep_rt=...', safe: 'kept' },
        list: [{ token: 'abc' }, { authorization: 'Bearer x' }],
      }),
    ]);

    const response = await service.list(ACTOR, { limit: 25 });
    const metadata = response.data[0]?.metadata as Record<string, unknown>;

    expect(metadata.password).toBe('[REDACTED]');
    expect(metadata.nested).toEqual({
      apiKey: '[REDACTED]',
      cookie: '[REDACTED]',
      safe: 'kept',
    });
    expect(metadata.list).toEqual([{ token: '[REDACTED]' }, { authorization: '[REDACTED]' }]);
  });

  it('bounds long strings and arrays in metadata', async () => {
    const service = createService([
      auditLog({
        long: 'a'.repeat(2_500),
        list: Array.from({ length: 150 }, (_, index) => index),
      }),
    ]);

    const response = await service.list(ACTOR, { limit: 25 });
    const metadata = response.data[0]?.metadata as { long: string; list: number[] };

    expect(metadata.long).toHaveLength(2_001);
    expect(metadata.long.endsWith('…')).toBe(true);
    expect(metadata.list).toHaveLength(100);
  });

  it('normalizes non-object metadata to an empty object', async () => {
    const service = createService([auditLog('not-an-object')]);
    const response = await service.list(ACTOR, { limit: 25 });

    expect(response.data[0]?.metadata).toEqual({});
  });

  it('rejects an invalid cursor before querying the repository', async () => {
    const service = createService([]);

    await expect(service.list(ACTOR, { limit: 25, cursor: 'invalid' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'CURSOR_INVALID',
    });
  });
});
