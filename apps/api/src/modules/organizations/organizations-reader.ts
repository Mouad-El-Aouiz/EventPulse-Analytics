import type { PrismaClient } from '@prisma/client';
import type {
  ActiveMembership,
  OrganizationsReader,
} from '../../shared/contracts/organizations-reader.js';

export class PrismaOrganizationsReader implements OrganizationsReader {
  constructor(private readonly client: PrismaClient) {}

  async listActiveMemberships(userId: string): Promise<ActiveMembership[]> {
    const memberships = await this.client.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
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
        organization: {
          select: { id: true, name: true, slug: true },
        },
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
}
