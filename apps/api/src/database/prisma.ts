import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export interface DatabaseLifecycle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

let prismaClient: PrismaClient | undefined;

function buildDatabaseUrl(databaseUrl: string, poolSize: number): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(poolSize));
  return url.toString();
}

export function getPrismaClient(): PrismaClient {
  if (prismaClient === undefined) {
    prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl(env.DATABASE_URL, env.DATABASE_POOL_SIZE),
        },
      },
    });
  }

  return prismaClient;
}

export function createPrismaDatabase(client: PrismaClient = getPrismaClient()): DatabaseLifecycle {
  return {
    connect: () => client.$connect(),
    disconnect: () => client.$disconnect(),
  };
}

export async function checkDatabaseConnection(
  client: PrismaClient = getPrismaClient(),
): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}
