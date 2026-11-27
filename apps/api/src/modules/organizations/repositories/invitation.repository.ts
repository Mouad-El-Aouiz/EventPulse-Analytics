import { Prisma, type Invitation, type Role } from '@prisma/client';
import { invitationAlreadyPendingError } from '../organizations.errors.js';
import type { DatabaseClient } from './database.js';

export interface InvitationWithInviter extends Invitation {
  invitedByUser: { id: string; displayName: string };
}

export class InvitationRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  list(organizationId: string): Promise<InvitationWithInviter[]> {
    return this.client.invitation.findMany({
      where: { organizationId },
      include: { invitedByUser: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(
    organizationId: string,
    invitationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Invitation | null> {
    return tx.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });
  }

  findByTokenHash(tokenHash: string, tx: DatabaseClient = this.client): Promise<Invitation | null> {
    return tx.invitation.findUnique({ where: { tokenHash } });
  }

  async lockByTokenHash(tokenHash: string, tx: DatabaseClient = this.client): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM "invitations" WHERE "token_hash" = ${tokenHash} FOR UPDATE
    `;
  }

  async create(
    input: {
      organizationId: string;
      email: string;
      role: Role;
      tokenHash: string;
      invitedByUserId: string;
      expiresAt: Date;
    },
    tx: DatabaseClient = this.client,
  ): Promise<Invitation> {
    try {
      return await tx.invitation.create({
        data: { ...input, status: 'PENDING' },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw invitationAlreadyPendingError();
      }

      throw error;
    }
  }

  async expirePendingForEmail(
    organizationId: string,
    email: string,
    now: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.invitation.updateMany({
      where: {
        organizationId,
        email,
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    return result.count;
  }

  async markAccepted(
    organizationId: string,
    invitationId: string,
    acceptedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt },
    });

    return result.count;
  }

  async markRevoked(
    organizationId: string,
    invitationId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt },
    });

    return result.count;
  }

  async revokePending(
    organizationId: string,
    invitationId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt },
    });

    return result.count;
  }

  async markExpired(
    organizationId: string,
    invitationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    return result.count;
  }
}
