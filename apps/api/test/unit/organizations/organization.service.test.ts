import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { OrganizationsFacade } from '../../../src/shared/contracts/organizations-facade.js';
import type { AuditPort } from '../../../src/shared/ports/audit.port.js';
import type { ActorContext } from '../../../src/shared/types/actor-context.js';
import { OrganizationService } from '../../../src/modules/organizations/services/organization.service.js';
import type { OrganizationRepository } from '../../../src/modules/organizations/repositories/organization.repository.js';
import type { MembershipRepository } from '../../../src/modules/organizations/repositories/membership.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../../../src/modules/organizations/repositories/organizations-unit-of-work.js';

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

const SETTINGS = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  exportRetentionDays: 30,
  createdAt: NOW,
  updatedAt: NOW,
};

function createHarness() {
  const facade = {
    getSettings: vi.fn().mockResolvedValue(SETTINGS),
    listUserOrganizations: vi.fn(),
  };
  const organizations = {
    findById: vi.fn().mockResolvedValue(SETTINGS),
    lockById: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue({ ...SETTINGS, name: 'Renamed' }),
  };
  const memberships = {
    findById: vi.fn().mockResolvedValue({
      id: 'membership-owner',
      organizationId: 'org-1',
      userId: ACTOR.userId,
      role: 'OWNER',
      status: 'ACTIVE',
    }),
  };
  const unitOfWork = {
    run: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn() };

  const service = new OrganizationService({
    organizations: organizations as unknown as OrganizationRepository,
    memberships: memberships as unknown as MembershipRepository,
    unitOfWork: unitOfWork as unknown as PrismaOrganizationsUnitOfWork,
    facade: facade as unknown as OrganizationsFacade,
    audit: audit as unknown as AuditPort,
    logger: logger as unknown as Logger,
  });

  return { service, facade, organizations, memberships, audit, logger };
}

describe('OrganizationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forbids an ADMIN from touching OWNER-only fields', async () => {
    const harness = createHarness();

    await expect(
      harness.service.update(
        { ...ACTOR, role: 'ADMIN' },
        { slug: 'new-slug' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(harness.organizations.update).not.toHaveBeenCalled();
  });

  it('updates allowed fields and audits only changed field names', async () => {
    const harness = createHarness();

    const view = await harness.service.update(
      ACTOR,
      { name: 'Renamed' },
      { ipAddress: '203.0.113.4', userAgent: 'vitest' },
    );

    expect(view.name).toBe('Renamed');
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'ORGANIZATION_SETTINGS_UPDATED',
        metadata: { fields: ['name'] },
      }),
    );
  });

  it('returns 404 when the active organization is missing', async () => {
    const harness = createHarness();
    harness.facade.getSettings.mockResolvedValue(null);

    await expect(harness.service.getCurrent(ACTOR)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ORGANIZATION_NOT_FOUND',
    });
  });

  it('keeps the update when audit recording fails and logs sanitized fields', async () => {
    const harness = createHarness();
    harness.audit.record.mockRejectedValue(new Error('connection reset with secret-token'));

    const view = await harness.service.update(
      ACTOR,
      { name: 'Renamed' },
      { ipAddress: null, userAgent: null },
    );

    expect(view.name).toBe('Renamed');
    expect(harness.logger.error).toHaveBeenCalledTimes(1);
    const fields = harness.logger.error.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(fields)).not.toContain('secret-token');
  });
});
