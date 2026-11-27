import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invitation, Membership } from '@prisma/client';
import type { Logger } from 'pino';
import type { AuthFacade } from '../../../src/modules/auth/auth.facade.js';
import { InvitationService } from '../../../src/modules/organizations/services/invitation.service.js';
import type { InvitationRepository } from '../../../src/modules/organizations/repositories/invitation.repository.js';
import type { MembershipRepository } from '../../../src/modules/organizations/repositories/membership.repository.js';
import type { OrganizationRepository } from '../../../src/modules/organizations/repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../../../src/modules/organizations/repositories/organizations-unit-of-work.js';
import type { OrganizationsFacade } from '../../../src/shared/contracts/organizations-facade.js';
import type { InvitationAccountGateway } from '../../../src/shared/contracts/invitation-account-gateway.js';
import { hashTokenWithPepper } from '../../../src/shared/crypto/token-hash.js';
import type { AuditPort } from '../../../src/shared/ports/audit.port.js';
import type { MailPort, OrganizationInvitationMail } from '../../../src/shared/ports/mail.port.js';
import type { ActorContext, AuthContext } from '../../../src/shared/types/actor-context.js';

const PEPPER = 'invitation-pepper-at-least-32-characters';
const NOW = new Date('2026-06-01T12:00:00Z');
const RAW_TOKEN = 'raw-invitation-token-value-1234567890';
const ACTOR: ActorContext = {
  userId: 'user-owner',
  sessionId: 'session',
  organizationId: 'org-1',
  roleHint: 'OWNER',
  tokenId: 'token',
  membershipId: 'membership-owner',
  role: 'OWNER',
};

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invitation-1',
    organizationId: 'org-1',
    email: 'invitee@example.test',
    role: 'ANALYST',
    status: 'PENDING',
    tokenHash: 'stored-hash',
    invitedByUserId: 'user-owner',
    expiresAt: new Date('2026-06-08T12:00:00Z'),
    acceptedAt: null,
    revokedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function membership(overrides: Partial<Membership> & { user?: unknown } = {}) {
  return {
    id: 'membership-actor',
    organizationId: 'org-1',
    userId: ACTOR.userId,
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    disabledAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    user: {
      id: ACTOR.userId,
      email: 'owner@example.test',
      displayName: 'Owner',
    },
    ...overrides,
  };
}

const ORGANIZATION = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  exportRetentionDays: 30,
  createdAt: NOW,
  updatedAt: NOW,
};

function issuedSession() {
  return {
    body: {
      accessToken: 'access-token',
      tokenType: 'Bearer' as const,
      expiresIn: 900,
      user: { id: 'user-new', email: 'invitee@example.test', displayName: 'Invitee' },
      activeOrganization: { id: 'org-1', name: 'Acme', slug: 'acme', role: 'ANALYST' as const },
    },
    refreshToken: 'refresh-token',
    refreshMaxAgeSeconds: 604800,
  };
}

function createHarness() {
  const invitations = {
    list: vi.fn(),
    findById: vi.fn(),
    findByTokenHash: vi.fn(),
    lockByTokenHash: vi.fn(),
    create: vi.fn(),
    expirePendingForEmail: vi.fn(),
    markAccepted: vi.fn().mockResolvedValue(1),
    markRevoked: vi.fn().mockResolvedValue(1),
    markExpired: vi.fn().mockResolvedValue(1),
    revokePending: vi.fn(),
  };
  const memberships = {
    findById: vi.fn().mockResolvedValue(membership()),
    findByEmail: vi.fn().mockResolvedValue(null),
    findByOrgAndUser: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  };
  const organizations = {
    findById: vi.fn().mockResolvedValue(ORGANIZATION),
    lockById: vi.fn().mockResolvedValue(undefined),
  };
  const facade = {
    getSettings: vi.fn().mockResolvedValue(ORGANIZATION),
  };
  const auth = {
    getUser: vi.fn().mockResolvedValue({
      id: 'user-owner',
      email: 'owner@example.test',
      displayName: 'Owner',
      isActive: true,
    }),
  };
  const invitationAccounts = {
    hashPassword: vi.fn().mockResolvedValue('argon2-hash'),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    provisionUser: vi.fn().mockResolvedValue({
      user: {
        id: 'user-new',
        email: 'invitee@example.test',
        displayName: 'Invitee',
        isActive: true,
      },
      created: true,
    }),
    issueSession: vi.fn().mockResolvedValue(issuedSession()),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
  };
  const mail = {
    assertAvailable: vi.fn().mockResolvedValue(undefined),
    sendOrganizationInvitation: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const unitOfWork = {
    run: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  };

  const service = new InvitationService({
    invitations: invitations as unknown as InvitationRepository,
    memberships: memberships as unknown as MembershipRepository,
    organizations: organizations as unknown as OrganizationRepository,
    facade: facade as unknown as OrganizationsFacade,
    unitOfWork: unitOfWork as unknown as PrismaOrganizationsUnitOfWork,
    auth: auth as unknown as AuthFacade,
    invitationAccounts: invitationAccounts as unknown as InvitationAccountGateway,
    mail: mail as unknown as MailPort,
    audit: audit as unknown as AuditPort,
    clock: { now: () => NOW },
    logger: logger as unknown as Logger,
    tokenPepper: PEPPER,
    ttlSeconds: 7 * 24 * 60 * 60,
  });

  return {
    service,
    invitations,
    memberships,
    organizations,
    gateway: invitationAccounts,
    auth,
    mail,
    audit,
    logger,
  };
}

describe('InvitationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forbids an ADMIN from inviting an OWNER', async () => {
    const harness = createHarness();
    harness.memberships.findById.mockResolvedValue(membership({ role: 'ADMIN' }));

    await expect(
      harness.service.create(
        { ...ACTOR, role: 'ADMIN' },
        { email: 'new@example.test', role: 'OWNER' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(harness.invitations.create).not.toHaveBeenCalled();
  });

  it('locks the organization before reading the actor role when creating an invitation', async () => {
    const harness = createHarness();
    harness.invitations.create.mockResolvedValue(invitation());

    await harness.service.create(
      ACTOR,
      { email: 'invitee@example.test', role: 'ANALYST' },
      { ipAddress: null, userAgent: null },
    );

    expect(harness.organizations.lockById).toHaveBeenCalledWith('org-1', {});
    expect(harness.organizations.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      harness.memberships.findById.mock.invocationCallOrder[0]!,
    );
  });

  it('stores only a peppered hash, sends the raw token once, and expires after 7 days', async () => {
    const harness = createHarness();
    const stored = invitation({ expiresAt: new Date('2026-06-08T12:00:00Z') });
    harness.invitations.create.mockResolvedValue(stored);

    const view = await harness.service.create(
      ACTOR,
      { email: 'invitee@example.test', role: 'ANALYST' },
      { ipAddress: null, userAgent: null },
    );

    const mail = harness.mail.sendOrganizationInvitation.mock.calls[0]?.[0] as
      OrganizationInvitationMail | undefined;
    const createInput = harness.invitations.create.mock.calls[0]?.[0] as {
      tokenHash: string;
      expiresAt: Date;
    };

    expect(mail?.invitationToken).toHaveLength(43);
    expect(createInput.tokenHash).toBe(hashTokenWithPepper(mail!.invitationToken, PEPPER));
    expect(createInput.tokenHash).not.toBe(mail?.invitationToken);
    expect(createInput.expiresAt).toEqual(new Date('2026-06-08T12:00:00Z'));
    expect(view).not.toHaveProperty('token');
    expect(view).not.toHaveProperty('tokenHash');
    expect(harness.invitations.expirePendingForEmail).toHaveBeenCalledWith(
      'org-1',
      'invitee@example.test',
      NOW,
      {},
    );
  });

  it('refuses to invite an existing member', async () => {
    const harness = createHarness();
    harness.memberships.findByEmail.mockResolvedValue({ id: 'membership-existing' });

    await expect(
      harness.service.create(
        ACTOR,
        { email: 'member@example.test', role: 'ANALYST' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_ALREADY_EXISTS' });

    expect(harness.invitations.create).not.toHaveBeenCalled();
  });

  it('revokes an invitation whose email delivery fails and logs no token', async () => {
    const harness = createHarness();
    harness.invitations.create.mockResolvedValue(invitation());
    harness.mail.sendOrganizationInvitation.mockRejectedValue(new Error('smtp down'));

    await expect(
      harness.service.create(
        ACTOR,
        { email: 'invitee@example.test', role: 'ANALYST' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'INVITATION_DELIVERY_FAILED' });

    expect(harness.invitations.markRevoked).toHaveBeenCalledWith('org-1', 'invitation-1', NOW);
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(RAW_TOKEN);
  });

  it('retries the fallback revocation after a transient failure', async () => {
    const harness = createHarness();
    harness.invitations.create.mockResolvedValue(invitation());
    harness.mail.sendOrganizationInvitation.mockRejectedValue(new Error('smtp down'));
    harness.invitations.markRevoked
      .mockRejectedValueOnce(new Error(`revocation failed ${RAW_TOKEN}`))
      .mockResolvedValueOnce(1);

    await expect(
      harness.service.create(
        ACTOR,
        { email: 'invitee@example.test', role: 'ANALYST' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'INVITATION_DELIVERY_FAILED' });

    expect(harness.invitations.markRevoked).toHaveBeenCalledTimes(2);
    expect(harness.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'INVITATION_REVOCATION_FAILED',
        invitationId: 'invitation-1',
        organizationId: 'org-1',
        attempt: 1,
        requiresManualRevocation: false,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(RAW_TOKEN);
  });

  it('logs a sanitized manual-recovery alert when every revocation attempt fails', async () => {
    const harness = createHarness();
    harness.invitations.create.mockResolvedValue(invitation());
    harness.mail.sendOrganizationInvitation.mockRejectedValue(new Error('smtp down'));
    harness.invitations.markRevoked.mockRejectedValue(new Error(`revocation failed ${RAW_TOKEN}`));

    await expect(
      harness.service.create(
        ACTOR,
        { email: 'invitee@example.test', role: 'ANALYST' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'INVITATION_DELIVERY_FAILED' });

    expect(harness.invitations.markRevoked).toHaveBeenCalledTimes(3);
    expect(harness.logger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'INVITATION_REVOCATION_FAILED',
        invitationId: 'invitation-1',
        organizationId: 'org-1',
        attempt: 3,
        maxAttempts: 3,
        requiresManualRevocation: true,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(RAW_TOKEN);
  });

  it('rejects acceptance for a different email', async () => {
    const harness = createHarness();
    harness.invitations.findByTokenHash.mockResolvedValue(invitation());

    await expect(
      harness.service.accept({ ...ACTOR, userId: 'user-other' } as AuthContext, 'raw-token', {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INVITATION_EMAIL_MISMATCH' });

    expect(harness.memberships.create).not.toHaveBeenCalled();
  });

  it('marks an expired invitation and rejects acceptance', async () => {
    const harness = createHarness();
    harness.invitations.findByTokenHash.mockResolvedValue(
      invitation({ expiresAt: new Date('2026-05-01T00:00:00Z') }),
    );

    await expect(
      harness.service.accept(ACTOR, 'raw-token', { ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });

    expect(harness.invitations.markExpired).toHaveBeenCalledWith('org-1', 'invitation-1', {});
    expect(harness.memberships.create).not.toHaveBeenCalled();
  });

  it('rejects a reused invitation', async () => {
    const harness = createHarness();
    harness.invitations.findByTokenHash.mockResolvedValue(
      invitation({ status: 'ACCEPTED', acceptedAt: NOW }),
    );

    await expect(
      harness.service.accept(ACTOR, 'raw-token', { ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(harness.memberships.create).not.toHaveBeenCalled();
  });

  it('accepts idempotently and consumes the invitation for an active same-role member', async () => {
    const harness = createHarness();
    harness.invitations.findByTokenHash.mockResolvedValue(invitation());
    harness.auth.getUser.mockResolvedValue({
      id: ACTOR.userId,
      email: 'invitee@example.test',
      displayName: 'Invitee',
      isActive: true,
    });
    harness.memberships.findByOrgAndUser.mockResolvedValue({
      id: 'membership-existing',
      organizationId: 'org-1',
      userId: ACTOR.userId,
      role: 'ANALYST',
      status: 'ACTIVE',
    });

    await expect(
      harness.service.accept(ACTOR, 'raw-token', { ipAddress: null, userAgent: null }),
    ).resolves.toEqual({
      membershipId: 'membership-existing',
      organizationId: 'org-1',
      role: 'ANALYST',
    });

    expect(harness.invitations.markAccepted).toHaveBeenCalledWith('org-1', 'invitation-1', NOW, {});
    expect(harness.memberships.create).not.toHaveBeenCalled();
  });

  it('does not consume a pending invitation when the existing membership is incompatible', async () => {
    const harness = createHarness();
    harness.invitations.findByTokenHash.mockResolvedValue(invitation());
    harness.auth.getUser.mockResolvedValue({
      id: ACTOR.userId,
      email: 'invitee@example.test',
      displayName: 'Invitee',
      isActive: true,
    });
    harness.memberships.findByOrgAndUser.mockResolvedValue({
      id: 'membership-existing',
      organizationId: 'org-1',
      userId: ACTOR.userId,
      role: 'VIEWER',
      status: 'ACTIVE',
    });

    await expect(
      harness.service.accept(ACTOR, 'raw-token', { ipAddress: null, userAgent: null }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_ALREADY_EXISTS' });

    expect(harness.invitations.markAccepted).not.toHaveBeenCalled();
    expect(harness.memberships.create).not.toHaveBeenCalled();
  });

  it('creates an ACTIVE membership and consumes the invitation atomically', async () => {
    const harness = createHarness();
    const pending = invitation();
    harness.invitations.findByTokenHash.mockResolvedValue(pending);
    harness.memberships.create.mockResolvedValue({ id: 'membership-new', role: 'ANALYST' });
    harness.auth.getUser.mockResolvedValue({
      id: 'user-invitee',
      email: 'invitee@example.test',
      displayName: 'Invitee',
      isActive: true,
    });

    const accepted = await harness.service.accept(
      { ...ACTOR, userId: 'user-invitee' } as AuthContext,
      'raw-token',
      { ipAddress: null, userAgent: null },
    );

    expect(harness.memberships.create).toHaveBeenCalledWith('org-1', 'user-invitee', 'ANALYST', {});
    expect(harness.invitations.markAccepted).toHaveBeenCalledWith('org-1', 'invitation-1', NOW, {});
    expect(accepted).toEqual({
      membershipId: 'membership-new',
      organizationId: 'org-1',
      role: 'ANALYST',
    });
  });

  describe('acceptWithToken', () => {
    it('creates a new account, membership, and session for case A', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation());
      harness.memberships.create.mockResolvedValue({ id: 'membership-new', role: 'ANALYST' });

      const accepted = await harness.service.acceptWithToken(
        { token: RAW_TOKEN, password: 'a-strong-password', displayName: 'New Person' },
        { ipAddress: '203.0.113.9', userAgent: 'vitest' },
      );

      expect(harness.invitations.lockByTokenHash).toHaveBeenCalled();
      expect(harness.gateway.provisionUser).toHaveBeenCalledWith(
        {
          email: 'invitee@example.test',
          displayName: 'New Person',
          passwordHash: 'argon2-hash',
        },
        {},
      );
      expect(harness.memberships.create).toHaveBeenCalledWith('org-1', 'user-new', 'ANALYST', {});
      expect(harness.gateway.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-new' }),
          organization: expect.objectContaining({ id: 'org-1' }),
          role: 'ANALYST',
        }),
        {},
      );
      expect(accepted.refreshToken).toBe('refresh-token');
      expect(accepted.body.activeOrganization).toMatchObject({ id: 'org-1', role: 'ANALYST' });
      expect(harness.invitations.markAccepted).toHaveBeenCalled();
    });

    it('uses the existing account without changing its password for case B', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation());
      harness.gateway.findUserByEmail.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.test',
        displayName: 'Existing',
        isActive: true,
      });
      harness.memberships.create.mockResolvedValue({ id: 'membership-new', role: 'ANALYST' });
      harness.gateway.issueSession.mockResolvedValue({
        ...issuedSession(),
        body: {
          ...issuedSession().body,
          user: { id: 'user-existing', email: 'invitee@example.test', displayName: 'Existing' },
        },
      });

      await harness.service.acceptWithToken(
        { token: RAW_TOKEN, password: 'attempted-new-password' },
        { ipAddress: null, userAgent: null },
      );

      expect(harness.gateway.provisionUser).not.toHaveBeenCalled();
      expect(harness.gateway.hashPassword).toHaveBeenCalled();
      expect(harness.memberships.create).toHaveBeenCalledWith(
        'org-1',
        'user-existing',
        'ANALYST',
        {},
      );
      expect(harness.gateway.issueSession).toHaveBeenCalled();
    });

    it('accepts an existing active member with the same role without creating a membership', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation());
      harness.gateway.findUserByEmail.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.test',
        displayName: 'Existing',
        isActive: true,
      });
      harness.memberships.findByOrgAndUser.mockResolvedValue({
        id: 'membership-existing',
        organizationId: 'org-1',
        userId: 'user-existing',
        role: 'ANALYST',
        status: 'ACTIVE',
      });

      const accepted = await harness.service.acceptWithToken(
        { token: RAW_TOKEN, password: 'a-strong-password' },
        { ipAddress: null, userAgent: null },
      );

      expect(harness.memberships.create).not.toHaveBeenCalled();
      expect(harness.invitations.markAccepted).toHaveBeenCalled();
      expect(harness.gateway.issueSession).toHaveBeenCalled();
      expect(accepted.membershipId).toBe('membership-existing');
    });

    it('does not consume the invitation when the membership role conflicts', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation({ role: 'OWNER' }));
      harness.gateway.findUserByEmail.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.test',
        displayName: 'Existing',
        isActive: true,
      });
      harness.memberships.findByOrgAndUser.mockResolvedValue({
        id: 'membership-existing',
        organizationId: 'org-1',
        userId: 'user-existing',
        role: 'ANALYST',
        status: 'ACTIVE',
      });

      await expect(
        harness.service.acceptWithToken(
          { token: RAW_TOKEN, password: 'a-strong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_ALREADY_EXISTS' });

      expect(harness.invitations.markAccepted).not.toHaveBeenCalled();
      expect(harness.gateway.issueSession).not.toHaveBeenCalled();
    });

    it('rejects inactive accounts without consuming the invitation', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation());
      harness.gateway.findUserByEmail.mockResolvedValue({
        id: 'user-existing',
        email: 'invitee@example.test',
        displayName: 'Existing',
        isActive: false,
      });

      await expect(
        harness.service.acceptWithToken(
          { token: RAW_TOKEN, password: 'a-strong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });

      expect(harness.invitations.markAccepted).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid', null],
      ['revoked', invitation({ status: 'REVOKED' })],
      ['expired status', invitation({ status: 'EXPIRED' })],
      ['already accepted', invitation({ status: 'ACCEPTED', acceptedAt: NOW })],
    ])('rejects a %s token', async (_label, stored) => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(stored);

      await expect(
        harness.service.acceptWithToken(
          { token: RAW_TOKEN, password: 'a-strong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });

      expect(harness.gateway.provisionUser).not.toHaveBeenCalled();
    });

    it('marks and rejects a time-expired invitation', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(
        invitation({ expiresAt: new Date('2026-05-01T00:00:00Z') }),
      );

      await expect(
        harness.service.acceptWithToken(
          { token: RAW_TOKEN, password: 'a-strong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });

      expect(harness.invitations.markExpired).toHaveBeenCalledWith('org-1', 'invitation-1', {});
      expect(harness.gateway.provisionUser).not.toHaveBeenCalled();
    });

    it('does not fail the acceptance when the audit sink is unavailable', async () => {
      const harness = createHarness();
      harness.invitations.findByTokenHash.mockResolvedValue(invitation());
      harness.memberships.create.mockResolvedValue({ id: 'membership-new', role: 'ANALYST' });
      harness.audit.record.mockRejectedValue(new Error('audit down'));

      await expect(
        harness.service.acceptWithToken(
          { token: RAW_TOKEN, password: 'a-strong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).resolves.toMatchObject({ refreshToken: 'refresh-token' });

      expect(harness.logger.error).toHaveBeenCalled();
    });
  });
});
