import type { Prisma, PrismaClient, User } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class UserRepository {
  constructor(private readonly client: PrismaClient) {}

  findByEmail(email: string, tx: DatabaseClient = this.client): Promise<User | null> {
    return tx.user.findUnique({ where: { email } });
  }

  findById(id: string, tx: DatabaseClient = this.client): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  async updateLastLogin(id: string, at: Date, tx: DatabaseClient = this.client): Promise<void> {
    await tx.user.update({
      where: { id },
      data: { lastLoginAt: at },
    });
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    tx: DatabaseClient = this.client,
  ): Promise<void> {
    await tx.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async lockById(id: string, tx: DatabaseClient = this.client): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = CAST(${id} AS uuid) FOR UPDATE`;
  }
}
