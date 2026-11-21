import { pathToFileURL } from 'node:url';
import { logger } from '../config/logger.js';
import { checkDatabaseConnection, createPrismaDatabase } from './prisma.js';

const DATABASE_CHECK_SUCCEEDED_MESSAGE = 'Database connection check succeeded';
const DATABASE_CHECK_FAILED_MESSAGE = 'Database connection check failed';
const DATABASE_DISCONNECT_FAILED_MESSAGE = 'Database disconnection failed';

export async function main(): Promise<void> {
  const database = createPrismaDatabase();

  try {
    await database.connect();
    await checkDatabaseConnection();
    logger.info(DATABASE_CHECK_SUCCEEDED_MESSAGE);
  } catch (error) {
    logger.error({ err: error }, DATABASE_CHECK_FAILED_MESSAGE);
    process.exitCode = 1;
  } finally {
    try {
      await database.disconnect();
    } catch (error) {
      logger.error({ err: error }, DATABASE_DISCONNECT_FAILED_MESSAGE);
      process.exitCode = 1;
    }
  }
}

const entrypoint = process.argv[1];

if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
