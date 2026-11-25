import type { Request } from 'express';
import { AppError } from '../../errors/app-error.js';

export const AUTH_ORIGIN_FORBIDDEN = 'AUTH_ORIGIN_FORBIDDEN';

export function originForbiddenError(): AppError {
  return new AppError('Origin not allowed', {
    statusCode: 403,
    code: AUTH_ORIGIN_FORBIDDEN,
    publicDetail: 'The request origin is not allowed.',
  });
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);
}

export function assertAllowedOrigin(req: Request, allowedOrigins: readonly string[]): void {
  const origin = req.get('origin');

  if (origin === undefined || origin === 'null' || !allowedOrigins.includes(origin)) {
    throw originForbiddenError();
  }
}
