import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';

export const AUTH_FORBIDDEN = 'AUTH_FORBIDDEN';
export const AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING';

export function authenticationRequiredError(): AppError {
  return new AppError('Authentication token missing', {
    statusCode: 401,
    code: AUTH_TOKEN_MISSING,
    publicDetail: 'Authentication is required.',
  });
}

export function forbiddenError(): AppError {
  return new AppError('Forbidden', {
    statusCode: 403,
    code: AUTH_FORBIDDEN,
    publicDetail: 'Access is forbidden.',
  });
}

export function requireRole(...roles: readonly Role[]): RequestHandler {
  const allowed = new Set<Role>(roles);

  return (req, _res, next) => {
    if (req.actor === undefined || !allowed.has(req.actor.role)) {
      next(forbiddenError());
      return;
    }

    next();
  };
}
