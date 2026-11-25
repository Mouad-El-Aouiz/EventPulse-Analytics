import type { Prisma, PrismaClient } from '@prisma/client';

export type AuthTransaction = Prisma.TransactionClient;

export class PrismaAuthUnitOfWork {
  constructor(private readonly client: PrismaClient) {}

  run<T>(callback: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(callback);
  }
}
