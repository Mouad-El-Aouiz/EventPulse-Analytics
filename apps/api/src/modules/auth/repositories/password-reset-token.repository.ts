import type { PasswordResetToken, Prisma, PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export interface NewPasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export class PasswordResetTokenRepository {
  constructor(private readonly client: PrismaClient) {}

  create(
    input: NewPasswordResetTokenInput,
    tx: DatabaseClient = this.client,
  ): Promise<PasswordResetToken> {
    return tx.passwordResetToken.create({ data: input });
  }

  findByHash(
    tokenHash: string,
    tx: DatabaseClient = this.client,
  ): Promise<PasswordResetToken | null> {
    return tx.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  async invalidateUnusedForUser(
    userId: string,
    at: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: at },
    });

    return result.count;
  }

  async consume(id: string, at: Date, tx: DatabaseClient = this.client): Promise<number> {
    const result = await tx.passwordResetToken.updateMany({
      where: {
        id,
        usedAt: null,
        expiresAt: { gt: at },
      },
      data: { usedAt: at },
    });

    return result.count;
  }
}
