import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from 'pino';
import type { Membership, Role, User } from '@prisma/client';
import { AuthFacade } from '../../src/modules/auth/auth.facade.js';
import { AuthInvitationAccountGateway } from '../../src/modules/auth/invitation-account.gateway.js';
import { PrismaAuthUnitOfWork } from '../../src/modules/auth/repositories/auth-unit-of-work.js';
import { SessionRepository } from '../../src/modules/auth/repositories/session.repository.js';
import { UserRepository } from '../../src/modules/auth/repositories/user.repository.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { PrismaAuditWriter } from '../../src/modules/audit/audit.writer.js';
import { PrismaOrganizationsFacade } from '../../src/modules/organizations/organizations-reader.js';
import { ApiKeyRepository } from '../../src/modules/organizations/repositories/api-key.repository.js';
import { InvitationRepository } from '../../src/modules/organizations/repositories/invitation.repository.js';
import { MembershipRepository } from '../../src/modules/organizations/repositories/membership.repository.js';
import { OrganizationRepository } from '../../src/modules/organizations/repositories/organization.repository.js';
import { PrismaOrganizationsUnitOfWork } from '../../src/modules/organizations/repositories/organizations-unit-of-work.js';
import { ApiKeyService } from '../../src/modules/organizations/services/api-key.service.js';
import { InvitationService } from '../../src/modules/organizations/services/invitation.service.js';
import { MembershipService } from '../../src/modules/organizations/services/membership.service.js';
import { OrganizationService } from '../../src/modules/organizations/services/organization.service.js';
import { hashTokenWithPepper } from '../../src/shared/crypto/token-hash.js';
import type { MailPort, OrganizationInvitationMail } from '../../src/shared/ports/mail.port.js';
import type { MembershipSessionGuard } from '../../src/shared/contracts/membership-session-guard.js';
import type { ActorContext, AuthContext } from '../../src/shared/types/actor-context.js';
import { createTestClient } from './helpers/database.js';
import {
  createEvent,
  createMembership,
  createOrganization,
  createTenant,
  createUser,
  uniqueEmail,
  type Tenant,
} from './helpers/factories.js';

const INVITATION_PEPPER = 'integration-invitation-pepper-at-least-32';
const API_KEY_PEPPER = 'integration-api-key-pepper-at-least-32';
const REFRESH_PEPPER = 'integration-refresh-pepper-at-least-32';
const JWT_SECRET = 'integration-jwt-secret-at-least-32-characters';
const METADATA = { ipAddress: '203.0.113.9', userAgent: 'vitest-integration' };

const client = createTestClient();
const logger = {
  error: () => undefined,
  warn: () => undefined,
} as unknown as Logger;

class RecordingMail implements MailPort {
  readonly invitations: OrganizationInvitationMail[] = [];
  failNext = false;

  async assertAvailable(): Promise<void> {}

  async sendPasswordReset(): Promise<void> {}

  async sendOrganizationInvitation(input: OrganizationInvitationMail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error(`smtp unavailable while sending ${input.invitationToken}`);
    }

    this.invitations.push(input);
  }
}

let harness: ReturnType<typeof createHarness>;

interface HarnessOptions {
  operationOrganizations?: OrganizationRepository;
  demotionOrganizations?: OrganizationRepository;
  membershipGuard?: MembershipSessionGuard;
}

function createHarness(options: HarnessOptions = {}) {
  const mail = new RecordingMail();
  const audit = new PrismaAuditWriter(client);
  const facade = new PrismaOrganizationsFacade(client);
  const unitOfWork = new PrismaOrganizationsUnitOfWork(client);
  const organizationsRepository = new OrganizationRepository(client);
  const operationOrganizations = options.operationOrganizations ?? organizationsRepository;
  const demotionOrganizations = options.demotionOrganizations ?? organizationsRepository;
  const membershipsRepository = new MembershipRepository(client);
  const invitationsRepository = new InvitationRepository(client);
  const apiKeysRepository = new ApiKeyRepository(client);
  const users = new UserRepository(client);
  const sessions = new SessionRepository(client);
  const auth = new AuthFacade(users, sessions);
  const clock = { now: () => new Date() };
  const tokens = new TokenService({
    secret: JWT_SECRET,
    issuer: 'eventpulse-analytics',
    audience: 'eventpulse-api',
    keyId: 'primary',
    accessTtlSeconds: 900,
  });
  const sessionService = new SessionService({
    sessions,
    memberships: options.membershipGuard ?? facade,
    tokens,
    unitOfWork: new PrismaAuthUnitOfWork(client),
    clock,
    refreshPepper: REFRESH_PEPPER,
    slidingTtlSeconds: 7 * 24 * 60 * 60,
    absoluteTtlSeconds: 30 * 24 * 60 * 60,
  });
  const invitationAccounts = new AuthInvitationAccountGateway({
    users,
    passwords: new PasswordService(),
    sessions: sessionService,
    tokens,
    clock,
  });

  return {
    mail,
    tokens,
    organizations: new OrganizationService({
      organizations: organizationsRepository,
      memberships: membershipsRepository,
      unitOfWork,
      facade,
      audit,
      logger,
    }),
    memberships: new MembershipService({
      memberships: membershipsRepository,
      organizations: demotionOrganizations,
      unitOfWork,
      auth,
      audit,
      clock,
      logger,
    }),
    invitations: new InvitationService({
      invitations: invitationsRepository,
      memberships: membershipsRepository,
      organizations: operationOrganizations,
      facade,
      unitOfWork,
      auth,
      invitationAccounts,
      mail,
      audit,
      clock,
      logger,
      tokenPepper: INVITATION_PEPPER,
      ttlSeconds: 7 * 24 * 60 * 60,
    }),
    apiKeys: new ApiKeyService({
      apiKeys: apiKeysRepository,
      memberships: membershipsRepository,
      organizations: operationOrganizations,
      unitOfWork,
      audit,
      clock,
      logger,
      keyPepper: API_KEY_PEPPER,
    }),
  };
}

function actorFor(tenant: Tenant, role: ActorContext['role'] = 'OWNER'): ActorContext {
  return {
    userId: tenant.user.id,
    sessionId: 'integration-session',
    organizationId: tenant.organization.id,
    roleHint: role,
    tokenId: 'integration-token',
    membershipId: tenant.membership.id,
    role,
  };
}

function authFor(user: User, organizationId: string): AuthContext {
  return {
    userId: user.id,
    sessionId: 'integration-session',
    organizationId,
    roleHint: 'VIEWER',
    tokenId: 'integration-token',
  };
}

async function addMember(
  tenant: Tenant,
  role: ActorContext['role'],
): Promise<{
  user: User;
  membership: Membership;
  actor: ActorContext;
}> {
  const user = await createUser(client);
  const membership = await createMembership(client, tenant.organization.id, user.id, role);

  return {
    user,
    membership,
    actor: {
      userId: user.id,
      sessionId: 'integration-session',
      organizationId: tenant.organization.id,
      roleHint: role,
      tokenId: 'integration-token',
      membershipId: membership.id,
      role,
    },
  };
}

async function seedInvitation(
  tenant: Tenant,
  email: string,
  role: Role = 'ANALYST',
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): Promise<{ token: string; invitationId: string }> {
  const token = randomBytes(32).toString('base64url');
  const invitation = await client.invitation.create({
    data: {
      organizationId: tenant.organization.id,
      email,
      role,
      status: 'PENDING',
      tokenHash: hashTokenWithPepper(token, INVITATION_PEPPER),
      invitedByUserId: tenant.user.id,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  return { token, invitationId: invitation.id };
}

function startGate(participants: number): <T>(task: () => Promise<T>) => Promise<T> {
  let arrived = 0;
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async <T>(task: () => Promise<T>): Promise<T> => {
    arrived += 1;

    if (arrived === participants) {
      release();
    }

    await opened;
    return task();
  };
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

interface OrganizationLockHooks {
  beforeLock?: () => void;
  afterLock?: () => Promise<void>;
}

class GatedMembershipSessionGuard implements MembershipSessionGuard {
  constructor(
    private readonly inner: PrismaOrganizationsFacade,
    private readonly hooks: {
      beforeLock?: () => Promise<void>;
      afterLock?: () => Promise<void>;
    },
  ) {}

  async lockActiveMembership(
    userId: string,
    organizationId: string,
    tx: Parameters<MembershipSessionGuard['lockActiveMembership']>[2],
  ): Promise<boolean> {
    await this.hooks.beforeLock?.();
    const active = await this.inner.lockActiveMembership(userId, organizationId, tx);
    await this.hooks.afterLock?.();

    return active;
  }
}

class GatedOrganizationRepository extends OrganizationRepository {
  constructor(private readonly hooks: OrganizationLockHooks) {
    super(client);
  }

  override async lockById(
    id: string,
    tx?: Parameters<OrganizationRepository['lockById']>[1],
  ): Promise<void> {
    this.hooks.beforeLock?.();
    await super.lockById(id, tx);
    await this.hooks.afterLock?.();
  }
}

type RaceOrder = 'operation-first' | 'demotion-first';

async function runOrderedRace<T>(
  order: RaceOrder,
  runOperation: (harness: ReturnType<typeof createHarness>) => Promise<T>,
  runDemotion: (harness: ReturnType<typeof createHarness>) => Promise<unknown>,
): Promise<{
  operation: PromiseSettledResult<T>;
  demotion: PromiseSettledResult<unknown>;
}> {
  const operationLocked = deferred();
  const operationAttempting = deferred();
  const demotionLocked = deferred();
  const demotionAttempting = deferred();
  const release = deferred();

  const race = createHarness({
    operationOrganizations: new GatedOrganizationRepository(
      order === 'operation-first'
        ? {
            afterLock: async () => {
              operationLocked.resolve();
              await release.promise;
            },
          }
        : { beforeLock: () => operationAttempting.resolve() },
    ),
    demotionOrganizations: new GatedOrganizationRepository(
      order === 'operation-first'
        ? { beforeLock: () => demotionAttempting.resolve() }
        : {
            afterLock: async () => {
              demotionLocked.resolve();
              await release.promise;
            },
          },
    ),
  });

  if (order === 'operation-first') {
    const operation = runOperation(race);
    await operationLocked.promise;
    const demotion = runDemotion(race);
    await demotionAttempting.promise;
    release.resolve();

    const [operationResult, demotionResult] = await Promise.allSettled([operation, demotion]);

    return { operation: operationResult, demotion: demotionResult };
  }

  const demotion = runDemotion(race);
  await demotionLocked.promise;
  const operation = runOperation(race);
  await operationAttempting.promise;
  release.resolve();

  const [operationResult, demotionResult] = await Promise.allSettled([operation, demotion]);

  return { operation: operationResult, demotion: demotionResult };
}

async function storedRole(membershipId: string): Promise<Role> {
  return (await client.membership.findUniqueOrThrow({ where: { id: membershipId } })).role;
}

beforeAll(() => {
  harness = createHarness();
});

afterAll(async () => {
  await client.$disconnect();
});

describe('organizations integration', () => {
  it('updates organization settings and persists them', async () => {
    const tenant = await createTenant(client);

    const updated = await harness.organizations.update(
      actorFor(tenant),
      { name: 'Renamed Org', timezone: 'Europe/London', exportRetentionDays: 14 },
      METADATA,
    );

    const stored = await client.organization.findUniqueOrThrow({
      where: { id: tenant.organization.id },
    });

    expect(updated.name).toBe('Renamed Org');
    expect(stored.name).toBe('Renamed Org');
    expect(stored.timezone).toBe('Europe/London');
    expect(stored.exportRetentionDays).toBe(14);
  });

  it('forbids an ADMIN from changing slug or currency', async () => {
    const tenant = await createTenant(client);
    const admin = await addMember(tenant, 'ADMIN');

    await expect(
      harness.organizations.update(admin.actor, { slug: 'unauthorized-slug' }, METADATA),
    ).rejects.toMatchObject({ statusCode: 403 });

    const stored = await client.organization.findUniqueOrThrow({
      where: { id: tenant.organization.id },
    });

    expect(stored.slug).toBe(tenant.organization.slug);
  });

  it('protects the last active OWNER', async () => {
    const tenant = await createTenant(client);

    await expect(
      harness.memberships.update(
        actorFor(tenant),
        tenant.membership.id,
        { role: 'ADMIN' },
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_OWNER_PROTECTED' });

    const stored = await client.membership.findUniqueOrThrow({
      where: { id: tenant.membership.id },
    });

    expect(stored.role).toBe('OWNER');
    expect(stored.status).toBe('ACTIVE');
  });

  it('keeps one owner under concurrent demotions', async () => {
    const organization = await createOrganization(client);
    const first = await createUser(client);
    const second = await createUser(client);
    const firstMembership = await createMembership(client, organization.id, first.id, 'OWNER');
    const secondMembership = await createMembership(client, organization.id, second.id, 'OWNER');

    const firstActor: ActorContext = {
      userId: first.id,
      sessionId: 's1',
      organizationId: organization.id,
      roleHint: 'OWNER',
      tokenId: 't1',
      membershipId: firstMembership.id,
      role: 'OWNER',
    };
    const secondActor: ActorContext = {
      userId: second.id,
      sessionId: 's2',
      organizationId: organization.id,
      roleHint: 'OWNER',
      tokenId: 't2',
      membershipId: secondMembership.id,
      role: 'OWNER',
    };

    const results = await Promise.allSettled([
      harness.memberships.update(firstActor, secondMembership.id, { role: 'ADMIN' }, METADATA),
      harness.memberships.update(secondActor, firstMembership.id, { role: 'ADMIN' }, METADATA),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The losing transaction re-reads its own membership after the winner
    // commits, sees itself demoted to ADMIN, and is refused as a non-owner.
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
    });

    const remainingOwners = await client.membership.count({
      where: { organizationId: organization.id, role: 'OWNER', status: 'ACTIVE' },
    });

    expect(remainingOwners).toBe(1);
  });

  describe('administrative operations serialize with role demotion', () => {
    it('lets invitation creation finish before demotion when it acquires the organization lock first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const email = uniqueEmail('race-invite');

      const { operation, demotion } = await runOrderedRace(
        'operation-first',
        (race) => race.invitations.create(admin.actor, { email, role: 'ANALYST' }, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(operation.status).toBe('fulfilled');
      expect(demotion.status).toBe('fulfilled');
      await expect(storedRole(admin.membership.id)).resolves.toBe('VIEWER');
      expect(
        await client.invitation.count({
          where: { organizationId: tenant.organization.id, email, status: 'PENDING' },
        }),
      ).toBe(1);
    });

    it('rejects invitation creation after demotion commits first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const email = uniqueEmail('race-invite');

      const { operation, demotion } = await runOrderedRace(
        'demotion-first',
        (race) => race.invitations.create(admin.actor, { email, role: 'ANALYST' }, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(demotion.status).toBe('fulfilled');
      expect(operation).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
      });
      await expect(storedRole(admin.membership.id)).resolves.toBe('VIEWER');
      expect(
        await client.invitation.count({
          where: { organizationId: tenant.organization.id, email },
        }),
      ).toBe(0);
    });

    it('lets invitation revocation finish before demotion when it acquires the organization lock first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const seeded = await seedInvitation(tenant, uniqueEmail('race-revoke'));

      const { operation, demotion } = await runOrderedRace(
        'operation-first',
        (race) => race.invitations.revoke(admin.actor, seeded.invitationId, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(operation.status).toBe('fulfilled');
      expect(demotion.status).toBe('fulfilled');
      await expect(
        client.invitation.findUniqueOrThrow({ where: { id: seeded.invitationId } }),
      ).resolves.toMatchObject({ status: 'REVOKED' });
      await expect(storedRole(admin.membership.id)).resolves.toBe('VIEWER');
    });

    it('rejects invitation revocation after demotion commits first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const seeded = await seedInvitation(tenant, uniqueEmail('race-revoke'));

      const { operation, demotion } = await runOrderedRace(
        'demotion-first',
        (race) => race.invitations.revoke(admin.actor, seeded.invitationId, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(demotion.status).toBe('fulfilled');
      expect(operation).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
      });
      await expect(
        client.invitation.findUniqueOrThrow({ where: { id: seeded.invitationId } }),
      ).resolves.toMatchObject({ status: 'PENDING' });
    });

    it('lets API key creation finish before demotion when it acquires the organization lock first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');

      const { operation, demotion } = await runOrderedRace(
        'operation-first',
        (race) =>
          race.apiKeys.create(
            admin.actor,
            { name: 'Race key', scopes: ['ingestion:write'] },
            METADATA,
          ),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(operation.status).toBe('fulfilled');
      expect(demotion.status).toBe('fulfilled');
      expect(await client.apiKey.count({ where: { organizationId: tenant.organization.id } })).toBe(
        1,
      );
      await expect(storedRole(admin.membership.id)).resolves.toBe('VIEWER');
    });

    it('rejects API key creation after demotion commits first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');

      const { operation, demotion } = await runOrderedRace(
        'demotion-first',
        (race) =>
          race.apiKeys.create(
            admin.actor,
            { name: 'Race key', scopes: ['ingestion:write'] },
            METADATA,
          ),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(demotion.status).toBe('fulfilled');
      expect(operation).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
      });
      expect(await client.apiKey.count({ where: { organizationId: tenant.organization.id } })).toBe(
        0,
      );
    });

    it('lets API key revocation finish before demotion when it acquires the organization lock first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const created = await harness.apiKeys.create(
        admin.actor,
        { name: 'Race revoke', scopes: ['ingestion:write'] },
        METADATA,
      );

      const { operation, demotion } = await runOrderedRace(
        'operation-first',
        (race) => race.apiKeys.revoke(admin.actor, created.id, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(operation.status).toBe('fulfilled');
      expect(demotion.status).toBe('fulfilled');
      await expect(
        client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ status: 'REVOKED' });
      await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    });

    it('rejects API key revocation after demotion commits first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const created = await harness.apiKeys.create(
        admin.actor,
        { name: 'Race revoke', scopes: ['ingestion:write'] },
        METADATA,
      );

      const { operation, demotion } = await runOrderedRace(
        'demotion-first',
        (race) => race.apiKeys.revoke(admin.actor, created.id, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(demotion.status).toBe('fulfilled');
      expect(operation).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
      });
      await expect(
        client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      await expect(harness.apiKeys.validate(created.secret)).resolves.toMatchObject({
        organizationId: tenant.organization.id,
      });
    });

    it('lets API key rotation finish before demotion when it acquires the organization lock first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const created = await harness.apiKeys.create(
        admin.actor,
        { name: 'Race rotate', scopes: ['ingestion:write'] },
        METADATA,
      );

      const { operation, demotion } = await runOrderedRace(
        'operation-first',
        (race) => race.apiKeys.rotate(admin.actor, created.id, {}, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(operation.status).toBe('fulfilled');
      expect(demotion.status).toBe('fulfilled');
      await expect(
        client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ status: 'REVOKED' });
      expect(
        await client.apiKey.count({
          where: { organizationId: tenant.organization.id, status: 'ACTIVE' },
        }),
      ).toBe(1);
      await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    });

    it('rejects API key rotation after demotion commits first', async () => {
      const tenant = await createTenant(client);
      const admin = await addMember(tenant, 'ADMIN');
      const created = await harness.apiKeys.create(
        admin.actor,
        { name: 'Race rotate', scopes: ['ingestion:write'] },
        METADATA,
      );

      const { operation, demotion } = await runOrderedRace(
        'demotion-first',
        (race) => race.apiKeys.rotate(admin.actor, created.id, {}, METADATA),
        (race) =>
          race.memberships.update(
            actorFor(tenant),
            admin.membership.id,
            { role: 'VIEWER' },
            METADATA,
          ),
      );

      expect(demotion.status).toBe('fulfilled');
      expect(operation).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
      });
      await expect(
        client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      expect(await client.apiKey.count({ where: { organizationId: tenant.organization.id } })).toBe(
        1,
      );
      await expect(harness.apiKeys.validate(created.secret)).resolves.toMatchObject({
        organizationId: tenant.organization.id,
      });
    });
  });

  it('returns 404 for a membership from another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);

    await expect(
      harness.memberships.update(
        actorFor(tenantA),
        tenantB.membership.id,
        { role: 'ADMIN' },
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'MEMBERSHIP_NOT_FOUND' });

    const stored = await client.membership.findUniqueOrThrow({
      where: { id: tenantB.membership.id },
    });

    expect(stored.role).toBe('OWNER');
  });

  it('releases managed events when an EVENT_MANAGER is disabled', async () => {
    const tenant = await createTenant(client);
    const manager = await addMember(tenant, 'EVENT_MANAGER');
    const event = await createEvent(client, tenant.organization.id, {
      managerMembershipId: manager.membership.id,
    });

    await harness.memberships.remove(actorFor(tenant), manager.membership.id, METADATA);

    const storedEvent = await client.event.findUniqueOrThrow({ where: { id: event.id } });
    const storedMembership = await client.membership.findUniqueOrThrow({
      where: { id: manager.membership.id },
    });

    expect(storedEvent.managerMembershipId).toBeNull();
    expect(storedMembership.status).toBe('DISABLED');
  });

  it('creates, delivers, accepts once, and isolates invitations', async () => {
    const tenant = await createTenant(client);
    const invitee = await createUser(client, { email: uniqueEmail('invitee') });

    const created = await harness.invitations.create(
      actorFor(tenant),
      { email: invitee.email, role: 'ANALYST' },
      METADATA,
    );

    const delivered = harness.mail.invitations.at(-1);
    const stored = await client.invitation.findUniqueOrThrow({ where: { id: created.id } });

    expect(delivered?.to).toBe(invitee.email);
    expect(stored.tokenHash).toBe(
      hashTokenWithPepper(delivered!.invitationToken, INVITATION_PEPPER),
    );
    expect(stored.tokenHash).not.toBe(delivered?.invitationToken);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 * 1000 - 1_000,
    );

    const wrongUser = await createUser(client);
    await expect(
      harness.invitations.accept(
        authFor(wrongUser, tenant.organization.id),
        delivered!.invitationToken,
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INVITATION_EMAIL_MISMATCH' });

    const accepted = await harness.invitations.accept(
      authFor(invitee, tenant.organization.id),
      delivered!.invitationToken,
      METADATA,
    );

    expect(accepted.role).toBe('ANALYST');
    await expect(
      client.membership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: tenant.organization.id,
            userId: invitee.id,
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE', role: 'ANALYST' });

    await expect(
      harness.invitations.accept(
        authFor(invitee, tenant.organization.id),
        delivered!.invitationToken,
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });
  });

  it('accepts idempotently through the authenticated flow for an active same-role member', async () => {
    const tenant = await createTenant(client);
    const { token, invitationId } = await seedInvitation(tenant, tenant.user.email, 'OWNER');

    const accepted = await harness.invitations.accept(
      authFor(tenant.user, tenant.organization.id),
      token,
      METADATA,
    );

    expect(accepted).toEqual({
      membershipId: tenant.membership.id,
      organizationId: tenant.organization.id,
      role: 'OWNER',
    });
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    await expect(
      client.membership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: tenant.organization.id,
            userId: tenant.user.id,
          },
        },
      }),
    ).resolves.toMatchObject({ role: 'OWNER', status: 'ACTIVE' });
    expect(await client.session.count({ where: { userId: tenant.user.id } })).toBe(0);
  });

  it('keeps the authenticated invitation PENDING when the membership role is incompatible', async () => {
    const tenant = await createTenant(client);
    const { token, invitationId } = await seedInvitation(tenant, tenant.user.email, 'VIEWER');

    await expect(
      harness.invitations.accept(authFor(tenant.user, tenant.organization.id), token, METADATA),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_ALREADY_EXISTS' });

    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(await client.session.count({ where: { userId: tenant.user.id } })).toBe(0);
  });

  it('rejects expired and revoked invitations', async () => {
    const tenant = await createTenant(client);
    const expiredUser = await createUser(client);
    const revokedUser = await createUser(client);
    const now = new Date();

    const expired = await harness.invitations.create(
      actorFor(tenant),
      { email: expiredUser.email, role: 'VIEWER' },
      METADATA,
    );
    const expiredToken = harness.mail.invitations.at(-1)!.invitationToken;
    await client.invitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(now.getTime() - 60_000) },
    });

    await expect(
      harness.invitations.accept(
        authFor(expiredUser, tenant.organization.id),
        expiredToken,
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: expired.id } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });

    const revoked = await harness.invitations.create(
      actorFor(tenant),
      { email: revokedUser.email, role: 'VIEWER' },
      METADATA,
    );
    const revokedToken = harness.mail.invitations.at(-1)!.invitationToken;
    await harness.invitations.revoke(actorFor(tenant), revoked.id, METADATA);

    await expect(
      harness.invitations.accept(
        authFor(revokedUser, tenant.organization.id),
        revokedToken,
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a one-time API secret, validates it, and revokes it', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Ingestion', scopes: ['ingestion:write'] },
      METADATA,
    );

    const stored = await client.apiKey.findUniqueOrThrow({ where: { id: created.id } });
    const list = await harness.apiKeys.list(actorFor(tenant));

    expect(stored.keyHash).toBe(hashTokenWithPepper(created.secret, API_KEY_PEPPER));
    expect(stored.keyHash).not.toContain(created.secret);
    expect(list[0]).not.toHaveProperty('secret');

    await expect(harness.apiKeys.validate(created.secret)).resolves.toMatchObject({
      organizationId: tenant.organization.id,
      scopes: ['ingestion:write'],
    });

    await harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA);
    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();

    const otherTenant = await createTenant(client);
    await expect(
      harness.apiKeys.revoke(actorFor(otherTenant), created.id, METADATA),
    ).rejects.toMatchObject({ statusCode: 404, code: 'API_KEY_NOT_FOUND' });
  });

  it('provisions a new account, membership and session from a public invitation token', async () => {
    const tenant = await createTenant(client);
    const email = uniqueEmail('public-invitee');
    const { token, invitationId } = await seedInvitation(tenant, email, 'ANALYST');
    const password = 'public-invitation-password';

    const accepted = await harness.invitations.acceptWithToken(
      { token, password, displayName: 'Public Invitee' },
      METADATA,
    );

    expect(accepted.organizationId).toBe(tenant.organization.id);
    expect(accepted.role).toBe('ANALYST');
    expect(accepted.body.activeOrganization).toMatchObject({
      id: tenant.organization.id,
      role: 'ANALYST',
    });
    expect(accepted.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);

    const user = await client.user.findUniqueOrThrow({ where: { email } });
    expect(user.displayName).toBe('Public Invitee');
    expect(user.lastLoginAt).not.toBeNull();
    await expect(new PasswordService().verify(user.passwordHash, password)).resolves.toBe(true);

    const payload = await harness.tokens.verifyAccessToken(accepted.body.accessToken);
    expect(payload).toMatchObject({
      userId: user.id,
      organizationId: tenant.organization.id,
      roleHint: 'ANALYST',
    });

    await expect(client.session.findMany({ where: { userId: user.id } })).resolves.toEqual([
      expect.objectContaining({ organizationId: tenant.organization.id, revokedAt: null }),
    ]);
    await expect(
      client.membership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: tenant.organization.id,
            userId: user.id,
          },
        },
      }),
    ).resolves.toMatchObject({ role: 'ANALYST', status: 'ACTIVE' });
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    await expect(
      harness.invitations.acceptWithToken({ token, password }, METADATA),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVITATION_INVALID' });
    expect(await client.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('reuses an existing account without modifying its password', async () => {
    const tenant = await createTenant(client);
    const existing = await createUser(client);
    const { token, invitationId } = await seedInvitation(tenant, existing.email, 'EVENT_MANAGER');

    await harness.invitations.acceptWithToken(
      { token, password: 'attacker-chosen-password' },
      METADATA,
    );

    const storedUser = await client.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(storedUser.passwordHash).toBe(existing.passwordHash);
    await expect(
      client.membership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: tenant.organization.id,
            userId: existing.id,
          },
        },
      }),
    ).resolves.toMatchObject({ role: 'EVENT_MANAGER', status: 'ACTIVE' });
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(await client.session.count({ where: { userId: existing.id, revokedAt: null } })).toBe(1);
  });

  it('does not consume an invitation when the existing membership is incompatible', async () => {
    const tenant = await createTenant(client);
    const { token, invitationId } = await seedInvitation(tenant, tenant.user.email, 'VIEWER');

    await expect(
      harness.invitations.acceptWithToken({ token, password: 'another-strong-password' }, METADATA),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_ALREADY_EXISTS' });

    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(
      await client.membership.count({
        where: { organizationId: tenant.organization.id, userId: tenant.user.id },
      }),
    ).toBe(1);
    expect(await client.session.count({ where: { userId: tenant.user.id } })).toBe(0);
  });

  it('consumes the token and reuses the membership for an active same-role member', async () => {
    const tenant = await createTenant(client);
    const { token, invitationId } = await seedInvitation(tenant, tenant.user.email, 'OWNER');

    const accepted = await harness.invitations.acceptWithToken(
      { token, password: 'same-role-member-password' },
      METADATA,
    );

    expect(accepted.membershipId).toBe(tenant.membership.id);
    expect(
      await client.membership.count({
        where: { organizationId: tenant.organization.id, userId: tenant.user.id },
      }),
    ).toBe(1);
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(await client.session.count({ where: { userId: tenant.user.id, revokedAt: null } })).toBe(
      1,
    );
  });

  it('revokes an invitation session created concurrently when acceptance wins the membership lock', async () => {
    const tenant = await createTenant(client);
    const invitee = await createUser(client);
    const inviteeMembership = await createMembership(
      client,
      tenant.organization.id,
      invitee.id,
      'ANALYST',
    );
    const { token, invitationId } = await seedInvitation(tenant, invitee.email, 'ANALYST');
    const acceptanceLocked = deferred();
    const releaseAcceptance = deferred();
    const disableAttempting = deferred();
    const guard = new GatedMembershipSessionGuard(new PrismaOrganizationsFacade(client), {
      afterLock: async () => {
        acceptanceLocked.resolve();
        await releaseAcceptance.promise;
      },
    });
    const race = createHarness({
      membershipGuard: guard,
      demotionOrganizations: new GatedOrganizationRepository({
        beforeLock: () => disableAttempting.resolve(),
      }),
    });

    const acceptance = race.invitations.acceptWithToken(
      { token, password: 'concurrent-acceptance-password' },
      METADATA,
    );
    await acceptanceLocked.promise;
    const disable = race.memberships.remove(actorFor(tenant), inviteeMembership.id, METADATA);
    await disableAttempting.promise;
    releaseAcceptance.resolve();

    const [acceptanceResult, disableResult] = await Promise.allSettled([acceptance, disable]);
    expect(acceptanceResult.status).toBe('fulfilled');
    expect(disableResult.status).toBe('fulfilled');
    await expect(
      client.membership.findUniqueOrThrow({ where: { id: inviteeMembership.id } }),
    ).resolves.toMatchObject({ status: 'DISABLED' });
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(await client.session.count({ where: { userId: invitee.id, revokedAt: null } })).toBe(0);
  });

  it('leaves no session and preserves the invitation when deactivation commits before acceptance', async () => {
    const tenant = await createTenant(client);
    const invitee = await createUser(client);
    const inviteeMembership = await createMembership(
      client,
      tenant.organization.id,
      invitee.id,
      'ANALYST',
    );
    const { token, invitationId } = await seedInvitation(tenant, invitee.email, 'ANALYST');
    const disableLocked = deferred();
    const releaseDisable = deferred();
    const acceptanceAttempting = deferred();
    const race = createHarness({
      operationOrganizations: new GatedOrganizationRepository({
        beforeLock: () => acceptanceAttempting.resolve(),
      }),
      demotionOrganizations: new GatedOrganizationRepository({
        afterLock: async () => {
          disableLocked.resolve();
          await releaseDisable.promise;
        },
      }),
    });

    const disable = race.memberships.remove(actorFor(tenant), inviteeMembership.id, METADATA);
    await disableLocked.promise;
    const acceptance = race.invitations.acceptWithToken(
      { token, password: 'concurrent-acceptance-password' },
      METADATA,
    );
    await acceptanceAttempting.promise;
    const acceptanceRejection = expect(acceptance).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBERSHIP_ALREADY_EXISTS',
    });
    releaseDisable.resolve();
    await disable;

    await acceptanceRejection;
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    await expect(
      client.membership.findUniqueOrThrow({ where: { id: inviteeMembership.id } }),
    ).resolves.toMatchObject({ status: 'DISABLED' });
    expect(await client.session.count({ where: { userId: invitee.id } })).toBe(0);
  });

  it('accepts a public invitation token exactly once under concurrency', async () => {
    const tenant = await createTenant(client);
    const email = uniqueEmail('concurrent-invitee');
    const { token, invitationId } = await seedInvitation(tenant, email);
    const gate = startGate(2);
    const attempt = () =>
      harness.invitations.acceptWithToken(
        { token, password: 'concurrent-accept-password' },
        METADATA,
      );

    const results = await Promise.allSettled([gate(attempt), gate(attempt)]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ statusCode: 400, code: 'INVITATION_INVALID' }),
    });

    const user = await client.user.findUniqueOrThrow({ where: { email } });
    expect(
      await client.membership.count({
        where: { organizationId: tenant.organization.id, userId: user.id },
      }),
    ).toBe(1);
    expect(await client.session.count({ where: { userId: user.id } })).toBe(1);
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
  });

  it('converges on a single account for simultaneous first-time acceptance in two organizations', async () => {
    const first = await createTenant(client);
    const second = await createTenant(client);
    const email = uniqueEmail('shared-invitee');
    const firstInvite = await seedInvitation(first, email, 'ANALYST');
    const secondInvite = await seedInvitation(second, email, 'VIEWER');
    const gate = startGate(2);

    const results = await Promise.allSettled([
      gate(() =>
        harness.invitations.acceptWithToken(
          { token: firstInvite.token, password: 'first-organization-password' },
          METADATA,
        ),
      ),
      gate(() =>
        harness.invitations.acceptWithToken(
          { token: secondInvite.token, password: 'second-organization-password' },
          METADATA,
        ),
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);

    const users = await client.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const user = users[0]!;
    expect(await client.membership.count({ where: { userId: user.id, status: 'ACTIVE' } })).toBe(2);
    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);

    const passwords = new PasswordService();
    const matches = await Promise.all([
      passwords.verify(user.passwordHash, 'first-organization-password'),
      passwords.verify(user.passwordHash, 'second-organization-password'),
    ]);
    expect(matches.filter(Boolean)).toHaveLength(1);
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: firstInvite.invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: secondInvite.invitationId } }),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });
  });

  it('keeps invitation, membership and session consistent when acceptance races revocation', async () => {
    const tenant = await createTenant(client);
    const { token, invitationId } = await seedInvitation(tenant, uniqueEmail('race-invitee'));
    const gate = startGate(2);

    const results = await Promise.allSettled([
      gate(() =>
        harness.invitations.acceptWithToken(
          { token, password: 'race-acceptance-password' },
          METADATA,
        ),
      ),
      gate(() => harness.invitations.revoke(actorFor(tenant), invitationId, METADATA)),
    ]);

    const invitation = await client.invitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    const accepted = results[0]?.status === 'fulfilled';
    const revoked = results[1]?.status === 'fulfilled';

    expect(accepted).not.toBe(revoked);

    if (accepted) {
      expect(invitation.status).toBe('ACCEPTED');
      const invitee = await client.user.findUniqueOrThrow({ where: { email: invitation.email } });
      expect(
        await client.membership.count({
          where: { organizationId: tenant.organization.id, userId: invitee.id },
        }),
      ).toBe(1);
      expect(await client.session.count({ where: { userId: invitee.id } })).toBe(1);
    } else {
      expect(invitation.status).toBe('REVOKED');
      expect(
        await client.membership.count({
          where: {
            organizationId: tenant.organization.id,
            user: { email: invitation.email },
          },
        }),
      ).toBe(0);
    }
  });

  it('rotates an API key atomically and invalidates the previous secret immediately', async () => {
    const tenant = await createTenant(client);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Rotation', scopes: ['ingestion:write'], expiresAt },
      METADATA,
    );

    const rotated = await harness.apiKeys.rotate(actorFor(tenant), created.id, {}, METADATA);

    expect(rotated.replacedKeyId).toBe(created.id);
    expect(rotated.scopes).toEqual(['ingestion:write']);
    expect(rotated.expiresAt).toEqual(expiresAt);
    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    await expect(harness.apiKeys.validate(rotated.secret)).resolves.toMatchObject({
      organizationId: tenant.organization.id,
    });
    await expect(
      client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'REVOKED' });

    const otherTenant = await createTenant(client);
    await expect(
      harness.apiKeys.rotate(actorFor(otherTenant), rotated.id, {}, METADATA),
    ).rejects.toMatchObject({ statusCode: 404, code: 'API_KEY_NOT_FOUND' });
  });

  it('allows only one of two concurrent rotations of the same API key', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Concurrent', scopes: ['ingestion:write'] },
      METADATA,
    );
    const gate = startGate(2);

    const results = await Promise.allSettled([
      gate(() => harness.apiKeys.rotate(actorFor(tenant), created.id, {}, METADATA)),
      gate(() => harness.apiKeys.rotate(actorFor(tenant), created.id, {}, METADATA)),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ statusCode: 409, code: 'API_KEY_NOT_ACTIVE' }),
    });

    const keys = await client.apiKey.findMany({
      where: { organizationId: tenant.organization.id },
    });
    expect(keys).toHaveLength(2);
    expect(keys.filter((key) => key.status === 'ACTIVE')).toHaveLength(1);
    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
  });

  it('creates independent keys concurrently', async () => {
    const tenant = await createTenant(client);
    const gate = startGate(2);

    const results = await Promise.all([
      gate(() =>
        harness.apiKeys.create(
          actorFor(tenant),
          { name: 'Concurrent A', scopes: ['ingestion:write'] },
          METADATA,
        ),
      ),
      gate(() =>
        harness.apiKeys.create(
          actorFor(tenant),
          { name: 'Concurrent B', scopes: ['ingestion:write'] },
          METADATA,
        ),
      ),
    ]);

    expect(new Set(results.map((created) => created.id)).size).toBe(2);
    expect(await client.apiKey.count({ where: { organizationId: tenant.organization.id } })).toBe(
      2,
    );
    await expect(harness.apiKeys.validate(results[0]!.secret)).resolves.toMatchObject({
      organizationId: tenant.organization.id,
    });
    await expect(harness.apiKeys.validate(results[1]!.secret)).resolves.toMatchObject({
      organizationId: tenant.organization.id,
    });
  });

  it('never validates a key after a concurrent revocation commits', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Revoked concurrently', scopes: ['ingestion:write'] },
      METADATA,
    );
    const gate = startGate(2);

    const [validation, revocation] = await Promise.all([
      gate(() => harness.apiKeys.validate(created.secret)),
      gate(() => harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA)),
    ]);

    expect(revocation).toBeUndefined();
    if (validation === null) {
      // Revocation reached its conditional update first; validation returns no principal.
    } else {
      expect(validation).toEqual({
        apiKeyId: created.id,
        organizationId: tenant.organization.id,
        scopes: ['ingestion:write'],
      });
    }
    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    await expect(
      client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'REVOKED' });
  });

  it('returns the full principal when validation happens before revocation', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Validation first', scopes: ['ingestion:write'] },
      METADATA,
    );

    await expect(harness.apiKeys.validate(created.secret)).resolves.toEqual({
      apiKeyId: created.id,
      organizationId: tenant.organization.id,
      scopes: ['ingestion:write'],
    });

    await harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA);

    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    await expect(
      client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'REVOKED' });
  });

  it('never returns a principal when validation happens after revocation', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Revocation first', scopes: ['ingestion:write'] },
      METADATA,
    );

    await harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA);

    await expect(harness.apiKeys.validate(created.secret)).resolves.toBeNull();
    await expect(
      client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'REVOKED', revokedAt: expect.any(Date) });
  });

  it('serializes two concurrent revocations and audits only one change', async () => {
    const tenant = await createTenant(client);
    const created = await harness.apiKeys.create(
      actorFor(tenant),
      { name: 'Double revoke', scopes: ['ingestion:write'] },
      METADATA,
    );
    const gate = startGate(2);

    const results = await Promise.allSettled([
      gate(() => harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA)),
      gate(() => harness.apiKeys.revoke(actorFor(tenant), created.id, METADATA)),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    await expect(
      client.apiKey.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'REVOKED' });
    expect(
      await client.auditLog.count({
        where: {
          organizationId: tenant.organization.id,
          actionType: 'API_KEY_REVOKED',
          resourceId: created.id,
        },
      }),
    ).toBe(1);
  });

  it('rejects an expiry in the past and refuses an already expired key', async () => {
    const tenant = await createTenant(client);

    await expect(
      harness.apiKeys.create(
        actorFor(tenant),
        {
          name: 'Expired',
          scopes: ['ingestion:write'],
          expiresAt: new Date(Date.now() - 60_000),
        },
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'API_KEY_EXPIRY_INVALID' });

    const rawKey = `epk_${randomBytes(6).toString('hex')}_${randomBytes(32).toString('hex')}`;
    await client.apiKey.create({
      data: {
        organizationId: tenant.organization.id,
        name: 'Long expired',
        keyPrefix: rawKey.slice(0, 16),
        keyHash: hashTokenWithPepper(rawKey, API_KEY_PEPPER),
        scopes: ['ingestion:write'],
        createdByUserId: tenant.user.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await expect(harness.apiKeys.validate(rawKey)).resolves.toBeNull();
  });

  it('authorizes administrative writes from the membership stored in the database, not the token hint', async () => {
    const tenant = await createTenant(client);
    const viewer = await addMember(tenant, 'VIEWER');
    const staleActor: ActorContext = { ...viewer.actor, role: 'OWNER', roleHint: 'OWNER' };

    await expect(
      harness.organizations.update(staleActor, { slug: 'stale-owner-slug' }, METADATA),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      harness.memberships.update(staleActor, viewer.membership.id, { role: 'ADMIN' }, METADATA),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      harness.invitations.create(
        staleActor,
        { email: uniqueEmail('stale'), role: 'VIEWER' },
        METADATA,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      harness.apiKeys.create(staleActor, { name: 'Stale', scopes: ['ingestion:write'] }, METADATA),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      client.membership.findUniqueOrThrow({ where: { id: viewer.membership.id } }),
    ).resolves.toMatchObject({ role: 'VIEWER' });
    expect(await client.apiKey.count({ where: { organizationId: tenant.organization.id } })).toBe(
      0,
    );
  });

  it('returns 404 when revoking an invitation from another organization', async () => {
    const first = await createTenant(client);
    const second = await createTenant(client);
    const email = uniqueEmail('cross-tenant');
    const created = await harness.invitations.create(
      actorFor(second),
      { email, role: 'VIEWER' },
      METADATA,
    );

    await expect(
      harness.invitations.revoke(actorFor(first), created.id, METADATA),
    ).rejects.toMatchObject({ statusCode: 404, code: 'INVITATION_NOT_FOUND' });

    await expect(
      client.invitation.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('revokes an invitation whose delivery fails and never leaves it pending', async () => {
    const tenant = await createTenant(client);
    const email = uniqueEmail('undeliverable');
    harness.mail.failNext = true;

    await expect(
      harness.invitations.create(actorFor(tenant), { email, role: 'ANALYST' }, METADATA),
    ).rejects.toMatchObject({ statusCode: 503, code: 'INVITATION_DELIVERY_FAILED' });

    const invitations = await client.invitation.findMany({
      where: { organizationId: tenant.organization.id, email },
    });

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ status: 'REVOKED' });
    expect(invitations[0]?.revokedAt).not.toBeNull();
    expect(await client.membership.count({ where: { user: { email } } })).toBe(0);
  });
});
