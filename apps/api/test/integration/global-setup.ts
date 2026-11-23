import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { analyzeMigrationDirectory } from '../../src/database/migration-safety.js';
import {
  assertSafeTestDatabaseUrl,
  ensureTestDatabase,
  resolveTestDatabaseUrl,
} from './helpers/database.js';

export default async function setup(): Promise<void> {
  dotenv.config({
    path: new URL('../../../../.env', import.meta.url),
    quiet: true,
  });

  const databaseUrl = resolveTestDatabaseUrl();
  const databaseName = assertSafeTestDatabaseUrl(databaseUrl);

  const migrationDirectory = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
  const findings = await analyzeMigrationDirectory(migrationDirectory);

  if (findings.length > 0) {
    const details = findings
      .map((finding) => `  ${finding.file}:${finding.line}: ${finding.message}`)
      .join('\n');

    throw new Error(`Migration safety check failed before integration tests:\n${details}`);
  }

  await ensureTestDatabase(databaseUrl);

  const schemaPath = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url));
  const prismaCli = fileURLToPath(
    new URL('../../../../node_modules/prisma/build/index.js', import.meta.url),
  );

  console.log(`[integration] applying migrations to "${databaseName}"`);

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
}
