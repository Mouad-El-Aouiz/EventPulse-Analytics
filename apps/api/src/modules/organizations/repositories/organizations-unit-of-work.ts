import type { Prisma, PrismaClient } from '@prisma/client';

export class PrismaOrganizationsUnitOfWork {
  constructor(private readonly client: PrismaClient) {}

  run<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(callback, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5_000,
      timeout: 15_000,
    });
  }
}
