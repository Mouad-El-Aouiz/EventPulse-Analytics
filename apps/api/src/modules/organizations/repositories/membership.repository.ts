import { Prisma, type Membership, type MembershipStatus, type Role } from '@prisma/client';
import { membershipAlreadyExistsError } from '../organizations.errors.js';
import type { DatabaseClient } from './database.js';

export interface MembershipWithUser extends Membership {
  user: { id: string; email: string; displayName: string };
}

const USER_SELECT = {
  user: { select: { id: true, email: true, displayName: true } },
} as const;

export interface MembershipUpdate {
  role?: Role;
  status?: MembershipStatus;
  disabledAt?: Date | null;
}

export class MembershipRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  listWithUsers(organizationId: string): Promise<MembershipWithUser[]> {
    return this.client.membership.findMany({
      where: { organizationId },
      include: USER_SELECT,
      orderBy: { joinedAt: 'asc' },
    });
  }

  findById(
    organizationId: string,
    membershipId: string,
    tx: DatabaseClient = this.client,
  ): Promise<MembershipWithUser | null> {
    return tx.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: USER_SELECT,
    });
  }

  findByEmail(
    organizationId: string,
    email: string,
    tx: DatabaseClient = this.client,
  ): Promise<Membership | null> {
    return tx.membership.findFirst({
      where: { organizationId, user: { email } },
    });
  }

  findByOrgAndUser(
    organizationId: string,
    userId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Membership | null> {
    return tx.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  async create(
    organizationId: string,
    userId: string,
    role: Role,
    tx: DatabaseClient = this.client,
  ): Promise<Membership> {
    try {
      return await tx.membership.create({
        data: { organizationId, userId, role, status: 'ACTIVE' },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw membershipAlreadyExistsError();
      }

      throw error;
    }
  }

  update(
    organizationId: string,
    membershipId: string,
    data: MembershipUpdate,
    tx: DatabaseClient = this.client,
  ): Promise<Membership> {
    return tx.membership.update({ where: { id: membershipId, organizationId }, data });
  }

  countActiveOwners(
    organizationId: string,
    excludeMembershipId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.membership.count({
      where: {
        organizationId,
        role: 'OWNER',
        status: 'ACTIVE',
        id: { not: excludeMembershipId },
      },
    });
  }

  async releaseManagedEvents(
    organizationId: string,
    membershipId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.event.updateMany({
      where: {
        organizationId,
        managerMembershipId: membershipId,
      },
      data: { managerMembershipId: null },
    });

    return result.count;
  }
}
