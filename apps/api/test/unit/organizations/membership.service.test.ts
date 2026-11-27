import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Membership, Role } from '@prisma/client';
import { MembershipService } from '../../../src/modules/organizations/services/membership.service.js';
import type { MembershipRepository } from '../../../src/modules/organizations/repositories/membership.repository.js';
import type { OrganizationRepository } from '../../../src/modules/organizations/repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../../../src/modules/organizations/repositories/organizations-unit-of-work.js';
import type { AuthFacade } from '../../../src/modules/auth/auth.facade.js';
import type { AuditPort } from '../../../src/shared/ports/audit.port.js';
import type { ActorContext } from '../../../src/shared/types/actor-context.js';
import type { Logger } from 'pino';

const ACTOR: ActorContext = {
  userId: 'user-actor',
  sessionId: 'session',
  organizationId: 'org-1',
  roleHint: 'OWNER',
  tokenId: 'token',
  membershipId: 'membership-actor',
  role: 'OWNER',
};

function membership(overrides: Partial<Membership> & { user?: unknown } = {}) {
  return {
    id: 'membership-target',
    organizationId: 'org-1',
    userId: 'user-target',
    role: 'OWNER' as Role,
    status: 'ACTIVE',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    disabledAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      id: 'user-target',
      email: 'target@example.test',
      displayName: 'Target',
    },
    ...overrides,
  };
}

function createHarness(actorRole: Role = 'OWNER') {
  const memberships = {
    listWithUsers: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByOrgAndUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countActiveOwners: vi.fn(),
    releaseManagedEvents: vi.fn(),
  };
  const organizations = { lockById: vi.fn() };
  const auth = { revokeUserSessions: vi.fn().mockResolvedValue(1) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const clock = { now: () => new Date('2026-06-01T12:00:00Z') };
  const unitOfWork = {
    run: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  };

  let target = membership();

  memberships.findById.mockImplementation(async (_organizationId: string, membershipId: string) => {
    if (membershipId === 'membership-target') {
      return target;
    }

    return membership({
      id: membershipId,
      userId: membershipId === 'membership-actor' ? ACTOR.userId : 'user-actor',
      role: actorRole,
      status: 'ACTIVE',
    });
  });

  const service = new MembershipService({
    memberships: memberships as unknown as MembershipRepository,
    organizations: organizations as unknown as OrganizationRepository,
    unitOfWork: unitOfWork as unknown as PrismaOrganizationsUnitOfWork,
    auth: auth as unknown as AuthFacade,
    audit: audit as unknown as AuditPort,
    clock,
    logger: logger as unknown as Logger,
  });

  return {
    service,
    memberships,
    organizations,
    auth,
    audit,
    logger,
    clock,
    setTarget(next: ReturnType<typeof membership>) {
      target = next;
    },
  };
}

describe('MembershipService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forbids an ADMIN from modifying an OWNER', async () => {
    const harness = createHarness('ADMIN');
    harness.setTarget(membership());

    await expect(
      harness.service.update(
        { ...ACTOR, role: 'ADMIN' },
        'membership-target',
        { role: 'ADMIN' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'AUTH_FORBIDDEN' });

    expect(harness.memberships.update).not.toHaveBeenCalled();
  });

  it('forbids an ADMIN from assigning the OWNER role', async () => {
    const harness = createHarness('ADMIN');
    harness.setTarget(membership({ role: 'EVENT_MANAGER', userId: 'user-target' }));

    await expect(
      harness.service.update(
        { ...ACTOR, role: 'ADMIN' },
        'membership-target',
        { role: 'OWNER' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('prevents a non-owner from escalating their own role', async () => {
    const harness = createHarness('ADMIN');
    harness.setTarget(membership({ role: 'ADMIN', userId: ACTOR.userId }));

    await expect(
      harness.service.update(
        { ...ACTOR, role: 'ADMIN' },
        'membership-target',
        { role: 'OWNER' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('protects the last active OWNER transactionally', async () => {
    const harness = createHarness();
    harness.setTarget(membership());
    harness.memberships.countActiveOwners.mockResolvedValue(0);

    await expect(
      harness.service.update(
        { ...ACTOR, userId: 'another-owner', membershipId: 'another-membership' },
        'membership-target',
        { role: 'ADMIN' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_OWNER_PROTECTED' });

    expect(harness.organizations.lockById).toHaveBeenCalledWith('org-1', {});
    expect(harness.memberships.update).not.toHaveBeenCalled();
  });

  it('allows demoting an OWNER when another active owner remains', async () => {
    const harness = createHarness();
    harness.setTarget(membership());
    harness.memberships.countActiveOwners.mockResolvedValue(1);
    harness.memberships.update.mockResolvedValue(membership({ role: 'ADMIN' }));

    await harness.service.update(
      { ...ACTOR, userId: 'another-owner', membershipId: 'another-membership' },
      'membership-target',
      { role: 'ADMIN' },
      { ipAddress: null, userAgent: null },
    );

    expect(harness.memberships.update).toHaveBeenCalledWith(
      'org-1',
      'membership-target',
      { role: 'ADMIN' },
      {},
    );
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ORGANIZATION_MEMBER_ROLE_CHANGED' }),
    );
  });

  it('keeps the membership change when audit recording fails', async () => {
    const harness = createHarness();
    harness.setTarget(membership({ role: 'EVENT_MANAGER', userId: 'user-target' }));
    harness.memberships.update.mockResolvedValue(
      membership({ role: 'VIEWER', userId: 'user-target' }),
    );
    harness.audit.record.mockRejectedValue(new Error('audit database unavailable'));

    await expect(
      harness.service.update(
        ACTOR,
        'membership-target',
        { role: 'VIEWER' },
        { ipAddress: null, userAgent: null },
      ),
    ).resolves.toMatchObject({ id: 'membership-target' });

    expect(harness.memberships.update).toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalled();
  });

  it('revokes sessions even when the membership is already DISABLED', async () => {
    const harness = createHarness();
    harness.setTarget(membership({ role: 'ANALYST', userId: 'user-disabled', status: 'DISABLED' }));
    harness.memberships.update.mockResolvedValue(
      membership({ role: 'ANALYST', userId: 'user-disabled', status: 'DISABLED' }),
    );

    await harness.service.remove(ACTOR, 'membership-target', {
      ipAddress: null,
      userAgent: null,
    });

    expect(harness.auth.revokeUserSessions).toHaveBeenCalledWith(
      'user-disabled',
      'org-1',
      new Date('2026-06-01T12:00:00Z'),
      {},
    );
    expect(harness.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ORGANIZATION_MEMBER_DISABLED' }),
    );
  });

  it('propagates a session revocation failure so the disable transaction can roll back', async () => {
    const harness = createHarness();
    harness.setTarget(membership({ role: 'ANALYST', userId: 'user-target' }));
    harness.memberships.update.mockResolvedValue(
      membership({ role: 'ANALYST', userId: 'user-target', status: 'DISABLED' }),
    );
    harness.auth.revokeUserSessions.mockRejectedValue(new Error('session store down'));

    await expect(
      harness.service.remove(ACTOR, 'membership-target', {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow('session store down');

    expect(harness.audit.record).not.toHaveBeenCalled();
  });

  it('releases managed events and revokes sessions when disabling an EVENT_MANAGER', async () => {
    const harness = createHarness();
    harness.setTarget(membership({ role: 'EVENT_MANAGER', userId: 'user-manager' }));
    harness.memberships.countActiveOwners.mockResolvedValue(1);
    harness.memberships.update.mockResolvedValue(
      membership({ role: 'EVENT_MANAGER', userId: 'user-manager', status: 'DISABLED' }),
    );
    harness.memberships.releaseManagedEvents.mockResolvedValue(3);

    await harness.service.remove(ACTOR, 'membership-target', {
      ipAddress: '203.0.113.5',
      userAgent: 'vitest',
    });

    expect(harness.memberships.releaseManagedEvents).toHaveBeenCalledWith(
      'org-1',
      'membership-target',
      {},
    );
    expect(harness.auth.revokeUserSessions).toHaveBeenCalledWith(
      'user-manager',
      'org-1',
      new Date('2026-06-01T12:00:00Z'),
      {},
    );
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'ORGANIZATION_MEMBER_DISABLED' }),
    );
  });
});
