import type { Prisma, PrismaClient, Session } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export interface NewSessionInput {
  userId: string;
  organizationId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export class SessionRepository {
  constructor(private readonly client: PrismaClient) {}

  create(input: NewSessionInput, tx: DatabaseClient = this.client): Promise<Session> {
    return tx.session.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        familyId: input.familyId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  findByRefreshTokenHash(
    refreshTokenHash: string,
    tx: DatabaseClient = this.client,
  ): Promise<Session | null> {
    return tx.session.findUnique({ where: { refreshTokenHash } });
  }

  findById(id: string, tx: DatabaseClient = this.client): Promise<Session | null> {
    return tx.session.findUnique({ where: { id } });
  }

  listActiveByUser(userId: string, now: Date): Promise<Session[]> {
    return this.client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async lockUser(userId: string, tx: DatabaseClient = this.client): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = CAST(${userId} AS uuid) FOR UPDATE`;
  }

  async revokeExcessActiveForUser(
    userId: string,
    keepCount: number,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE "sessions"
      SET "revoked_at" = ${revokedAt}
      WHERE "id" IN (
        SELECT "id"
        FROM "sessions"
        WHERE "user_id" = CAST(${userId} AS uuid)
          AND "revoked_at" IS NULL
          AND "expires_at" > ${revokedAt}
          AND "absolute_expires_at" > ${revokedAt}
        ORDER BY "created_at" DESC
        OFFSET CAST(${keepCount} AS integer)
      )
    `;
  }

  async claimRotation(
    sessionId: string,
    expectedHash: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: {
        id: sessionId,
        refreshTokenHash: expectedHash,
        revokedAt: null,
      },
      data: { revokedAt, lastUsedAt: revokedAt },
    });

    return result.count;
  }

  async setReplacement(
    sessionId: string,
    replacementSessionId: string,
    tx: DatabaseClient = this.client,
  ): Promise<void> {
    await tx.session.update({
      where: { id: sessionId },
      data: { replacedBySessionId: replacementSessionId },
    });
  }

  async revokeByIdForUser(
    sessionId: string,
    userId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt },
    });

    return result.count;
  }

  async revokeCurrent(
    sessionId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });

    return result.count;
  }

  async revokeAllForUser(
    userId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });

    return result.count;
  }

  async revokeAllForUserInOrganization(
    userId: string,
    organizationId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { userId, organizationId, revokedAt: null },
      data: { revokedAt },
    });

    return result.count;
  }

  async revokeFamily(
    familyId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });

    return result.count;
  }
}
