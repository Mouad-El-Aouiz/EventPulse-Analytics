import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { verifyDatabaseIntegrity } from './integrity.js';

async function main(): Promise<void> {
  const client = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });

  try {
    const report = await verifyDatabaseIntegrity(client);

    if (report.errors.length > 0) {
      console.error(`Database integrity verification failed (${report.errors.length} error(s)):`);

      for (const error of report.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log(`Database integrity verified: ${report.checked} catalog checks passed.`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
