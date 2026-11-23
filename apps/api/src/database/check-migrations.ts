import { fileURLToPath } from 'node:url';
import { analyzeMigrationDirectory } from './migration-safety.js';

async function main(): Promise<void> {
  const directory = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
  const findings = await analyzeMigrationDirectory(directory);

  if (findings.length > 0) {
    console.error(`Migration safety check failed (${findings.length} finding(s)):`);

    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line}: ${finding.message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('Migration safety check passed: no unprotected drop of a protected object.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
