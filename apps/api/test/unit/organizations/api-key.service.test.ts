import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKey } from '@prisma/client';
import type { Logger } from 'pino';
import { ApiKeyService } from '../../../src/modules/organizations/services/api-key.service.js';
import type { ApiKeyRepository } from '../../../src/modules/organizations/repositories/api-key.repository.js';
import type { MembershipRepository } from '../../../src/modules/organizations/repositories/membership.repository.js';
import type { OrganizationRepository } from '../../../src/modules/organizations/repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../../../src/modules/organizations/repositories/organizations-unit-of-work.js';
import { hashTokenWithPepper } from '../../../src/shared/crypto/token-hash.js';
import type { AuditPort } from '../../../src/shared/ports/audit.port.js';
import type { ActorContext } from '../../../src/shared/types/actor-context.js';

const PEPPER = 'api-key-pepper-at-least-32-characters';
const NOW = new Date('2026-06-01T12:00:00Z');
const ACTOR: ActorContext = {
  userId: 'user-owner',
  sessionId: 'session',
  organizationId: 'org-1',
  roleHint: 'OWNER',
  tokenId: 'token',
  membershipId: 'membership-owner',
  role: 'OWNER',
};

function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-1',
    organizationId: 'org-1',
    name: 'Ingestion',
    keyPrefix: 'epk_abcdefgh',
    keyHash: 'stored-hash',
    scopes: ['ingestion:write'],
    status: 'ACTIVE',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdByUserId: 'user-owner',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createHarness(actorRole: ActorContext['role'] = 'OWNER') {
  const apiKeys = {
    list: vi.fn(),
    findById: vi.fn(),
    findByHash: vi.fn(),
    lockById: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    revoke: vi.fn(),
    touchLastUsed: vi.fn().mockResolvedValue(1),
  };
  const memberships = {
    findById: vi.fn().mockResolvedValue({
      id: ACTOR.membershipId,
      organizationId: ACTOR.organizationId,
      userId: ACTOR.userId,
      role: actorRole,
      status: 'ACTIVE',
    }),
  };
  const organizations = {
    lockById: vi.fn().mockResolvedValue(undefined),
  };
  const unitOfWork = {
    run: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new ApiKeyService({
    apiKeys: apiKeys as unknown as ApiKeyRepository,
    memberships: memberships as unknown as MembershipRepository,
    organizations: organizations as unknown as OrganizationRepository,
    unitOfWork: unitOfWork as unknown as PrismaOrganizationsUnitOfWork,
    audit: audit as unknown as AuditPort,
    clock: { now: () => NOW },
    logger: logger as unknown as Logger,
    keyPepper: PEPPER,
  });

  return { service, apiKeys, memberships, organizations, audit, logger };
}

describe('ApiKeyService', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([[[]], [['ingestion:write', 'ingestion:write']], [['admin:write']]])(
    'rejects invalid scopes: %j',
    async (scopes) => {
      const harness = createHarness();

      await expect(
        harness.service.create(
          ACTOR,
          { name: 'Key', scopes },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'API_KEY_SCOPES_INVALID' });

      expect(harness.apiKeys.create).not.toHaveBeenCalled();
    },
  );

  it('locks the organization before reading the actor role when creating a key', async () => {
    const harness = createHarness();
    harness.apiKeys.create.mockResolvedValue(apiKey());

    await harness.service.create(
      ACTOR,
      { name: 'Key', scopes: ['ingestion:write'] },
      { ipAddress: null, userAgent: null },
    );

    expect(harness.organizations.lockById).toHaveBeenCalledWith('org-1', {});
    expect(harness.organizations.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      harness.memberships.findById.mock.invocationCallOrder[0]!,
    );
  });

  it('returns the 256-bit secret once and stores only its peppered hash', async () => {
    const harness = createHarness();
    harness.apiKeys.create.mockImplementation(
      async (input: { keyPrefix: string; keyHash: string }) =>
        apiKey({ keyPrefix: input.keyPrefix, keyHash: input.keyHash }),
    );

    const created = await harness.service.create(
      ACTOR,
      { name: 'Ingestion', scopes: ['ingestion:write'] },
      { ipAddress: null, userAgent: null },
    );

    const stored = harness.apiKeys.create.mock.calls[0]?.[0] as {
      keyPrefix: string;
      keyHash: string;
    };
    const secretPart = created.secret.slice(created.secret.lastIndexOf('_') + 1);

    expect(secretPart).toHaveLength(64);
    expect(created.secret).toBe(`${stored.keyPrefix}_${secretPart}`);
    expect(stored.keyHash).toBe(hashTokenWithPepper(created.secret, PEPPER));
    expect(stored.keyHash).not.toContain(secretPart);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'API_KEY_CREATED' }),
    );
  });

  it('still returns the one-time secret when audit recording fails', async () => {
    const harness = createHarness();
    harness.apiKeys.create.mockResolvedValue(apiKey());
    harness.audit.record.mockRejectedValue(new Error('audit unavailable'));

    const created = await harness.service.create(
      ACTOR,
      { name: 'Ingestion', scopes: ['ingestion:write'] },
      { ipAddress: null, userAgent: null },
    );

    expect(created.secret).toBeDefined();
    expect(harness.logger.error).toHaveBeenCalled();
  });

  it('rejects a revoked key and does not touch last use', async () => {
    const harness = createHarness();
    harness.apiKeys.findByHash.mockResolvedValue(apiKey({ status: 'REVOKED' }));

    await expect(harness.service.validate('raw-key')).resolves.toBeNull();
    expect(harness.apiKeys.touchLastUsed).not.toHaveBeenCalled();
  });

  it('rejects an expired key', async () => {
    const harness = createHarness();
    harness.apiKeys.findByHash.mockResolvedValue(
      apiKey({ expiresAt: new Date('2026-05-01T00:00:00Z') }),
    );

    await expect(harness.service.validate('raw-key')).resolves.toBeNull();
  });

  it('rejects a key without ingestion:write', async () => {
    const harness = createHarness();
    harness.apiKeys.findByHash.mockResolvedValue(apiKey({ scopes: [] }));

    await expect(harness.service.validate('raw-key')).resolves.toBeNull();
  });

  it('validates an active key and updates last use', async () => {
    const harness = createHarness();
    harness.apiKeys.findByHash.mockResolvedValue(apiKey());

    await expect(harness.service.validate('raw-key')).resolves.toEqual({
      apiKeyId: 'key-1',
      organizationId: 'org-1',
      scopes: ['ingestion:write'],
    });
    expect(harness.apiKeys.touchLastUsed).toHaveBeenCalledWith('org-1', 'key-1', NOW);
  });

  it('rejects a key that was revoked between lookup and last-use update', async () => {
    const harness = createHarness();
    harness.apiKeys.findByHash.mockResolvedValue(apiKey());
    harness.apiKeys.touchLastUsed.mockResolvedValue(0);

    await expect(harness.service.validate('raw-key')).resolves.toBeNull();
  });

  it('creates a key with a future expiry and rejects a past expiry', async () => {
    const harness = createHarness();
    const expiresAt = new Date('2026-12-01T00:00:00Z');
    harness.apiKeys.create.mockImplementation(
      async (input: { keyPrefix: string; keyHash: string; expiresAt: Date | null }) =>
        apiKey({
          keyPrefix: input.keyPrefix,
          keyHash: input.keyHash,
          expiresAt: input.expiresAt,
        }),
    );

    const created = await harness.service.create(
      ACTOR,
      { name: 'Expiring', scopes: ['ingestion:write'], expiresAt },
      { ipAddress: null, userAgent: null },
    );

    expect(created.expiresAt).toEqual(expiresAt);
    expect(harness.apiKeys.create.mock.calls[0]?.[0]).toMatchObject({ expiresAt });

    await expect(
      harness.service.create(
        ACTOR,
        {
          name: 'Past',
          scopes: ['ingestion:write'],
          expiresAt: new Date('2026-05-01T00:00:00Z'),
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'API_KEY_EXPIRY_INVALID' });

    expect(harness.apiKeys.create).toHaveBeenCalledTimes(1);
  });

  it('forbids a non-manager from creating a key inside the transaction', async () => {
    const harness = createHarness('VIEWER');

    await expect(
      harness.service.create(
        ACTOR,
        { name: 'Denied', scopes: ['ingestion:write'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(harness.apiKeys.create).not.toHaveBeenCalled();
  });

  it('rotates a key atomically, preserves scopes, and returns the new secret once', async () => {
    const harness = createHarness();
    harness.apiKeys.findById.mockResolvedValue(apiKey());
    harness.apiKeys.revoke.mockResolvedValue(1);
    harness.apiKeys.create.mockImplementation(
      async (input: { keyPrefix: string; keyHash: string; scopes: string[] }) =>
        apiKey({
          id: 'key-2',
          keyPrefix: input.keyPrefix,
          keyHash: input.keyHash,
          scopes: input.scopes,
          createdAt: NOW,
        }),
    );

    const rotated = await harness.service.rotate(
      ACTOR,
      'key-1',
      {},
      { ipAddress: null, userAgent: null },
    );

    const secretPart = rotated.secret.slice(rotated.secret.lastIndexOf('_') + 1);
    const createInput = harness.apiKeys.create.mock.calls[0]?.[0] as {
      scopes: string[];
      keyHash: string;
      keyPrefix: string;
    };

    expect(secretPart).toHaveLength(64);
    expect(rotated.replacedKeyId).toBe('key-1');
    expect(rotated.scopes).toEqual(['ingestion:write']);
    expect(createInput.scopes).toEqual(['ingestion:write']);
    expect(createInput.keyHash).toBe(hashTokenWithPepper(rotated.secret, PEPPER));
    expect(harness.apiKeys.revoke).toHaveBeenCalledWith('org-1', 'key-1', NOW, {});
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'API_KEY_ROTATED' }),
    );
  });

  it('refuses to rotate a revoked key', async () => {
    const harness = createHarness();
    harness.apiKeys.findById.mockResolvedValue(apiKey({ status: 'REVOKED', revokedAt: NOW }));

    await expect(
      harness.service.rotate(ACTOR, 'key-1', {}, { ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'API_KEY_NOT_ACTIVE' });

    expect(harness.apiKeys.create).not.toHaveBeenCalled();
  });

  it('refuses to rotate a missing key', async () => {
    const harness = createHarness();
    harness.apiKeys.findById.mockResolvedValue(null);

    await expect(
      harness.service.rotate(ACTOR, 'key-1', {}, { ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'API_KEY_NOT_FOUND' });
  });
});
