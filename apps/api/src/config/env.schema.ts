import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

function formatIssues(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.');

      return `- ${path}: ${issue.message}`;
    })
    .join('\n');

  return `Invalid environment configuration:\n${details}`;
}

export function parseEnv(source: EnvSource): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new Error(formatIssues(result.error));
  }

  return result.data;
}
