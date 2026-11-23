import { z } from 'zod';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

// PostgreSQL max_connections defaults to 100. A single API process must not be
// able to reserve the entire server capacity on its own.
export const MAX_DATABASE_POOL_SIZE = 100;

function isPostgresUrl(value: string): boolean {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .url()
      .refine(isPostgresUrl, { message: 'Must be a PostgreSQL connection URL.' }),
    DATABASE_RUNTIME_URL: z
      .string()
      .url()
      .refine(isPostgresUrl, { message: 'Must be a PostgreSQL connection URL.' })
      .optional(),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(MAX_DATABASE_POOL_SIZE).default(10),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.DATABASE_RUNTIME_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_RUNTIME_URL'],
        message: 'Must be set in production to avoid running the API as the schema owner.',
      });
    }
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
