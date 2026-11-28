import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/errors/app-error.js';
import { sanitizedErrorFields } from '../../../src/errors/error-logging.js';

describe('sanitizedErrorFields', () => {
  it('keeps safe identifiers but never the raw message', () => {
    const error = new AppError('token=supersecret postgresql://db', {
      statusCode: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });

    const fields = sanitizedErrorFields(error);

    expect(fields).toEqual({
      errorName: 'AppError',
      errorCode: 'DEPENDENCY_UNAVAILABLE',
      statusCode: 503,
    });
    expect(fields).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(fields)).not.toContain('supersecret');
  });

  it('applies fallback code and status for non-AppError values', () => {
    const fields = sanitizedErrorFields(new Error('connection refused'), {
      code: 'FALLBACK_CODE',
      status: 500,
    });

    expect(fields).toEqual({
      errorName: 'Error',
      errorCode: 'FALLBACK_CODE',
      statusCode: 500,
    });
  });

  it('never treats a raw thrown value as a message', () => {
    expect(sanitizedErrorFields('token=leaked')).toEqual({ errorName: 'string' });
  });
});
