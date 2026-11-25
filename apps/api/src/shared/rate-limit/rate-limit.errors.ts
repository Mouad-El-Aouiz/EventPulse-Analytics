import { AppError } from '../../errors/app-error.js';

export const RATE_LIMITED_CODE = 'AUTH_RATE_LIMITED';
export const REDIS_UNAVAILABLE_CODE = 'AUTH_REDIS_UNAVAILABLE';

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded', {
      statusCode: 429,
      code: RATE_LIMITED_CODE,
      publicDetail: 'Too many requests. Try again later.',
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
  }
}

export class RedisUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super('Rate-limit store unavailable', {
      statusCode: 503,
      code: REDIS_UNAVAILABLE_CODE,
      publicDetail: 'The service is temporarily unavailable.',
      cause,
      isOperational: true,
    });
  }
}
