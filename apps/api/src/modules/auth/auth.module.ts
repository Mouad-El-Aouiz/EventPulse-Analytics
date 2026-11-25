import type { Router } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { parseAllowedOrigins } from '../../shared/http/origin.js';
import { NullMailPort } from '../../shared/mail/null-mail.js';
import { systemClock } from '../../shared/ports/clock.port.js';
import { createRateLimiter } from '../../shared/rate-limit/create-rate-limiter.js';
import { PrismaAuditWriter } from '../audit/audit.writer.js';
import { PrismaOrganizationsReader } from '../organizations/organizations-reader.js';
import { AuthController } from './auth.controller.js';
import { AuthService, type AuditFlushResult } from './auth.service.js';
import { createAuthRouter as createAuthRoutes } from './auth.routes.js';
import { PrismaAuthUnitOfWork } from './repositories/auth-unit-of-work.js';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { PasswordService } from './services/password.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';
import {
  createAuthenticateMiddleware,
  createOptionalAuthenticateMiddleware,
} from './middleware/authenticate.middleware.js';
import { createRequireOriginMiddleware } from './middleware/require-origin.middleware.js';
import { createTenantContextMiddleware } from './middleware/tenant-context.middleware.js';
import { createUserRateLimitMiddleware } from './middleware/user-rate-limit.middleware.js';

const FALLBACK_JWT_SECRET = 'development-only-jwt-secret-change-before-production';
const FALLBACK_REFRESH_PEPPER = 'development-only-refresh-pepper-change-before-production';
const FALLBACK_RESET_PEPPER = 'development-only-reset-pepper-change-before-production';
const FALLBACK_ORIGIN = 'http://localhost:5173';
const USER_ROUTE_MAX_ATTEMPTS = 300;
const USER_ROUTE_WINDOW_SECONDS = 60;
const DEFAULT_AUTH_AUDIT_FLUSH_TIMEOUT_MS = 3_000;

let activeAuthService: AuthService | undefined;

export function flushAuthAudits(
  timeoutMs = DEFAULT_AUTH_AUDIT_FLUSH_TIMEOUT_MS,
): Promise<AuditFlushResult> {
  if (activeAuthService === undefined) {
    return Promise.resolve({ drained: true, pending: 0 });
  }

  return activeAuthService.flushBackgroundAudits(timeoutMs);
}

export function createAuthRouter(): Router {
  const client = getPrismaClient();
  const clock = systemClock;

  const users = new UserRepository(client);
  const sessions = new SessionRepository(client);
  const resetTokens = new PasswordResetTokenRepository(client);
  const organizations = new PrismaOrganizationsReader(client);
  const audit = new PrismaAuditWriter(client);
  const passwords = new PasswordService();
  const rateLimiter = createRateLimiter();

  const tokens = new TokenService({
    secret: env.JWT_ACCESS_SECRET ?? FALLBACK_JWT_SECRET,
    issuer: env.JWT_ISSUER ?? 'eventpulse-analytics',
    audience: env.JWT_AUDIENCE ?? 'eventpulse-api',
    keyId: env.JWT_KEY_ID ?? 'primary',
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS ?? 900,
  });

  const unitOfWork = new PrismaAuthUnitOfWork(client);

  const sessionService = new SessionService({
    sessions,
    tokens,
    unitOfWork,
    clock,
    refreshPepper: env.REFRESH_TOKEN_PEPPER ?? FALLBACK_REFRESH_PEPPER,
    slidingTtlSeconds: env.REFRESH_SLIDING_TTL_SECONDS ?? 7 * 24 * 60 * 60,
    absoluteTtlSeconds: env.SESSION_ABSOLUTE_TTL_SECONDS ?? 30 * 24 * 60 * 60,
  });

  const mail = new NullMailPort(env.NODE_ENV !== 'production');

  const passwordResetService = new PasswordResetService({
    users,
    resetTokens,
    sessions,
    passwords,
    mail,
    unitOfWork,
    tokens,
    clock,
    resetPepper: env.PASSWORD_RESET_TOKEN_PEPPER ?? FALLBACK_RESET_PEPPER,
    resetTtlSeconds: env.PASSWORD_RESET_TTL_SECONDS ?? 1800,
  });

  const service = new AuthService({
    users,
    sessions,
    organizations,
    audit,
    passwords,
    tokens,
    sessionService,
    passwordResetService,
    rateLimiter,
    clock,
    logger,
    refreshPepper: env.REFRESH_TOKEN_PEPPER ?? FALLBACK_REFRESH_PEPPER,
    resetPepper: env.PASSWORD_RESET_TOKEN_PEPPER ?? FALLBACK_RESET_PEPPER,
    loginLimit: {
      maxAttempts: env.AUTH_LOGIN_MAX_ATTEMPTS ?? 10,
      windowSeconds: env.AUTH_LOGIN_WINDOW_SECONDS ?? 900,
    },
    forgotLimit: {
      maxAttempts: env.AUTH_FORGOT_MAX_ATTEMPTS ?? 5,
      windowSeconds: env.AUTH_FORGOT_WINDOW_SECONDS ?? 3600,
    },
    refreshLimit: {
      maxAttempts: env.AUTH_REFRESH_MAX_ATTEMPTS ?? 60,
      windowSeconds: env.AUTH_REFRESH_WINDOW_SECONDS ?? 3600,
    },
    lockout: {
      threshold: env.AUTH_LOCKOUT_THRESHOLD ?? 5,
      baseSeconds: env.AUTH_LOCKOUT_BASE_SECONDS ?? 60,
      maxSeconds: env.AUTH_LOCKOUT_MAX_SECONDS ?? 86_400,
    },
  });

  activeAuthService = service;

  let allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (allowedOrigins.length === 0 && env.NODE_ENV !== 'production') {
    allowedOrigins = [FALLBACK_ORIGIN];
  }

  const controller = new AuthController({
    service,
    allowedOrigins,
    cookie: {
      secure: env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production',
      domain: env.AUTH_COOKIE_DOMAIN,
    },
  });

  const authenticateDependencies = {
    tokens,
    sessions,
    users,
    clock,
  };

  return createAuthRoutes({
    controller,
    authenticate: createAuthenticateMiddleware(authenticateDependencies),
    optionalAuthenticate: createOptionalAuthenticateMiddleware(authenticateDependencies),
    tenantContext: createTenantContextMiddleware(organizations),
    requireOrigin: createRequireOriginMiddleware(allowedOrigins),
    userRateLimit: createUserRateLimitMiddleware(
      rateLimiter,
      USER_ROUTE_MAX_ATTEMPTS,
      USER_ROUTE_WINDOW_SECONDS,
    ),
  });
}
