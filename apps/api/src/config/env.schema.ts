import { z } from 'zod';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);

// PostgreSQL max_connections defaults to 100. A single API process must not be
// able to reserve the entire server capacity on its own.
export const MAX_DATABASE_POOL_SIZE = 100;

const DEVELOPMENT_JWT_SECRET = 'development-only-jwt-secret-change-before-production';
const DEVELOPMENT_REFRESH_PEPPER = 'development-only-refresh-pepper-change-before-production';
const DEVELOPMENT_RESET_PEPPER = 'development-only-reset-pepper-change-before-production';
const DEVELOPMENT_CORS_ORIGINS = 'http://localhost:5173';

function isUrlWithProtocols(value: string, protocols: ReadonlySet<string>): boolean {
  try {
    return protocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}

const COOKIE_DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isValidCookieDomain(value: string): boolean {
  const domain = value.startsWith('.') ? value.slice(1) : value;

  if (domain.length === 0) {
    return false;
  }

  return domain.split('.').every((label) => COOKIE_DOMAIN_LABEL.test(label));
}

function splitOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

const secretSchema = z.string().min(32).optional();

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
      .refine((value) => isUrlWithProtocols(value, POSTGRES_PROTOCOLS), {
        message: 'Must be a PostgreSQL connection URL.',
      }),
    DATABASE_RUNTIME_URL: z
      .string()
      .url()
      .refine((value) => isUrlWithProtocols(value, POSTGRES_PROTOCOLS), {
        message: 'Must be a PostgreSQL connection URL.',
      })
      .optional(),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(MAX_DATABASE_POOL_SIZE).default(10),

    JWT_ACCESS_SECRET: secretSchema,
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    JWT_ISSUER: z.string().min(1).max(120).default('eventpulse-analytics'),
    JWT_AUDIENCE: z.string().min(1).max(120).default('eventpulse-api'),
    JWT_KEY_ID: z.string().min(1).max(64).default('primary'),

    REFRESH_TOKEN_PEPPER: secretSchema,
    PASSWORD_RESET_TOKEN_PEPPER: secretSchema,
    REFRESH_SLIDING_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(30 * 24 * 60 * 60)
      .default(7 * 24 * 60 * 60),
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(365 * 24 * 60 * 60)
      .default(30 * 24 * 60 * 60),
    PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(24 * 60 * 60)
      .default(1800),

    AUTH_COOKIE_SECURE: booleanFromEnv.optional(),
    AUTH_COOKIE_DOMAIN: z
      .string()
      .min(1)
      .max(253)
      .refine(isValidCookieDomain, { message: 'Must be a valid cookie domain.' })
      .optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    REDIS_URL: z
      .string()
      .url()
      .refine((value) => isUrlWithProtocols(value, REDIS_PROTOCOLS), {
        message: 'Must be a Redis connection URL.',
      })
      .optional(),
    REDIS_KEY_PREFIX: z.string().min(1).max(64).default('eventpulse'),

    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    AUTH_FORGOT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_FORGOT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    AUTH_REFRESH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1000).default(60),
    AUTH_REFRESH_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    AUTH_LOCKOUT_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_LOCKOUT_BASE_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
    AUTH_LOCKOUT_MAX_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60 * 60)
      .default(86_400),
    AUTH_RATE_LIMIT_FAIL_CLOSED: booleanFromEnv.default(true),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.DATABASE_RUNTIME_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_RUNTIME_URL'],
        message: 'Must be set in production to avoid running the API as the schema owner.',
      });
    }

    if (value.NODE_ENV === 'production') {
      const requiredSecrets = [
        'JWT_ACCESS_SECRET',
        'REFRESH_TOKEN_PEPPER',
        'PASSWORD_RESET_TOKEN_PEPPER',
      ] as const;

      for (const name of requiredSecrets) {
        if (value[name] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'Must be set in production.',
          });
        }
      }

      if (
        value.JWT_ACCESS_SECRET === DEVELOPMENT_JWT_SECRET ||
        value.REFRESH_TOKEN_PEPPER === DEVELOPMENT_REFRESH_PEPPER ||
        value.PASSWORD_RESET_TOKEN_PEPPER === DEVELOPMENT_RESET_PEPPER
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message: 'Development-only secrets must not be used in production.',
        });
      }

      if (value.REDIS_URL === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_URL'],
          message: 'Must be set in production to enforce durable rate limiting.',
        });
      }

      if (value.CORS_ALLOWED_ORIGINS === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ALLOWED_ORIGINS'],
          message: 'Must contain at least one allowed frontend origin in production.',
        });
      }

      if (value.AUTH_COOKIE_SECURE === false) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_COOKIE_SECURE'],
          message: 'Must be true in production.',
        });
      }

      if (value.AUTH_RATE_LIMIT_FAIL_CLOSED === false) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_RATE_LIMIT_FAIL_CLOSED'],
          message: 'Must be true in production; auth rate limiting cannot fail open.',
        });
      }
    }

    if (value.CORS_ALLOWED_ORIGINS !== undefined) {
      const origins = splitOrigins(value.CORS_ALLOWED_ORIGINS);

      if (origins.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ALLOWED_ORIGINS'],
          message: 'Must contain at least one origin when set.',
        });
      }

      for (const origin of origins) {
        if (!isHttpOrigin(origin)) {
          ctx.addIssue({
            code: 'custom',
            path: ['CORS_ALLOWED_ORIGINS'],
            message: `Invalid origin: ${origin}`,
          });
        }
      }

      if (origins.includes('*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ALLOWED_ORIGINS'],
          message: 'Wildcard origins are not allowed when credentials are enabled.',
        });
      }
    }

    if (value.SESSION_ABSOLUTE_TTL_SECONDS < value.REFRESH_SLIDING_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_TTL_SECONDS'],
        message: 'Must be greater than or equal to REFRESH_SLIDING_TTL_SECONDS.',
      });
    }

    if (value.AUTH_LOCKOUT_MAX_SECONDS < value.AUTH_LOCKOUT_BASE_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_LOCKOUT_MAX_SECONDS'],
        message: 'Must be greater than or equal to AUTH_LOCKOUT_BASE_SECONDS.',
      });
    }
  })
  .transform((value) => {
    const nodeEnv = value.NODE_ENV;

    return {
      ...value,
      JWT_ACCESS_SECRET: value.JWT_ACCESS_SECRET ?? DEVELOPMENT_JWT_SECRET,
      REFRESH_TOKEN_PEPPER: value.REFRESH_TOKEN_PEPPER ?? DEVELOPMENT_REFRESH_PEPPER,
      PASSWORD_RESET_TOKEN_PEPPER: value.PASSWORD_RESET_TOKEN_PEPPER ?? DEVELOPMENT_RESET_PEPPER,
      CORS_ALLOWED_ORIGINS: value.CORS_ALLOWED_ORIGINS ?? DEVELOPMENT_CORS_ORIGINS,
      AUTH_COOKIE_SECURE: value.AUTH_COOKIE_SECURE ?? nodeEnv === 'production',
    };
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
