import { env } from '../config/env.js';
import { AppError } from './app-error.js';

export interface ErrorLogFields {
  errorName: string;
  errorCode?: string;
  statusCode?: number;
  errorMessage?: string;
}

export interface ErrorLogFallback {
  code?: string;
  status?: number;
}

/**
 * Builds log-safe error metadata. Raw messages are only emitted outside
 * production; stacks and the original error object are never emitted.
 */
export function errorLogFields(error: unknown, fallback: ErrorLogFallback = {}): ErrorLogFields {
  const fields: ErrorLogFields = {
    errorName: error instanceof Error ? error.name : typeof error,
  };

  const code = error instanceof AppError ? error.code : fallback.code;
  const status = error instanceof AppError ? error.statusCode : fallback.status;

  if (code !== undefined) {
    fields.errorCode = code;
  }

  if (status !== undefined) {
    fields.statusCode = status;
  }

  if (env.NODE_ENV !== 'production' && error instanceof Error) {
    fields.errorMessage = error.message;
  }

  return fields;
}

/**
 * Log-safe error fields for security-sensitive paths: backend error messages
 * can embed query fragments, tokens or email addresses, so they are never
 * forwarded even outside production.
 */
export function sanitizedErrorFields(
  error: unknown,
  fallback: ErrorLogFallback = {},
): Omit<ErrorLogFields, 'errorMessage'> {
  const fields = errorLogFields(error, fallback);
  delete fields.errorMessage;

  return fields;
}
