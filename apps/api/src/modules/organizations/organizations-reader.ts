import type { Prisma, PrismaClient, Role } from '@prisma/client';
import type { MembershipSessionGuard } from '../../shared/contracts/membership-session-guard.js';
import type { ActiveMembership } from '../../shared/contracts/organizations-reader.js';
import type {
  OrganizationSettings,
  OrganizationsFacade,
  UserOrganization,
} from '../../shared/contracts/organizations-facade.js';
import { forbiddenError } from '../../shared/http/authorization.js';

const ORGANIZATION_SUMMARY = { id: true, name: true, slug: true } as const;

export class PrismaOrganizationsFacade implements OrganizationsFacade, MembershipSessionGuard {
  constructor(private readonly client: PrismaClient) {}

  async listActiveMemberships(userId: string): Promise<ActiveMembership[]> {
    const memberships = await this.client.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        organization: { select: ORGANIZATION_SUMMARY },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      role: membership.role,
      organization: membership.organization,
    }));
  }

  async getActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<ActiveMembership | null> {
    const membership = await this.client.membership.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      include: {
        organization: { select: ORGANIZATION_SUMMARY },
      },
    });

    if (membership === null) {
      return null;
    }

    return {
      membershipId: membership.id,
      role: membership.role,
      organization: membership.organization,
    };
  }

  async listUserOrganizations(userId: string): Promise<UserOrganization[]> {
    const memberships = await this.client.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        organization: { select: ORGANIZATION_SUMMARY },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((membership) => ({
      ...membership.organization,
      membershipId: membership.id,
      role: membership.role,
    }));
  }

  async getSettings(organizationId: string): Promise<OrganizationSettings | null> {
    return this.client.organization.findUnique({
      where: { id: organizationId },
      select: {
        ...ORGANIZATION_SUMMARY,
        timezone: true,
        currency: true,
        exportRetentionDays: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async lockActiveMembership(
    userId: string,
    organizationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    // Sessions reference the organization, so their insert takes a KEY SHARE lock on it.
    // Acquiring that lock before the membership keeps the org -> membership order used by
    // administrative writes, otherwise a concurrent disable holding org FOR UPDATE deadlocks.
    const organizations = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "organizations"
      WHERE "id" = CAST(${organizationId} AS uuid)
      FOR KEY SHARE
    `;

    if (organizations.length === 0) {
      return false;
    }

    const rows = await tx.$queryRaw<Array<{ active: boolean }>>`
      SELECT ("status" = 'ACTIVE') AS "active"
      FROM "memberships"
      WHERE "organization_id" = CAST(${organizationId} AS uuid)
        AND "user_id" = CAST(${userId} AS uuid)
      FOR UPDATE
    `;

    return rows[0]?.active === true;
  }

  async assertRole(
    userId: string,
    organizationId: string,
    allowedRoles: readonly Role[],
  ): Promise<ActiveMembership> {
    const membership = await this.getActiveMembership(userId, organizationId);

    if (membership === null || !allowedRoles.includes(membership.role)) {
      throw forbiddenError();
    }

    return membership;
  }
}
