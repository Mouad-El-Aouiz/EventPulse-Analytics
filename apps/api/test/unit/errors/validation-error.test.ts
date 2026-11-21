import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/errors/app-error.js';
import {
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_DETAIL,
  ValidationError,
} from '../../../src/errors/validation-error.js';

describe('ValidationError', () => {
  it('constructs a 400 operational error compatible with AppError', () => {
    const error = new ValidationError([
      {
        path: 'body.email',
        code: 'invalid_format',
        message: 'Invalid email format.',
      },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Request validation failed');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(VALIDATION_ERROR_CODE);
    expect(error.publicDetail).toBe(VALIDATION_ERROR_DETAIL);
    expect(error.isOperational).toBe(true);
    expect(error.issues).toEqual([
      {
        path: 'body.email',
        code: 'invalid_format',
        message: 'Invalid email format.',
      },
    ]);
  });

  it('copies validation issues instead of retaining mutable references', () => {
    const issues = [
      {
        path: 'query.limit',
        code: 'too_small',
        message: 'Value is too small.',
      },
    ];

    const error = new ValidationError(issues);
    issues[0]!.message = 'mutated message';

    expect(error.issues[0]?.message).toBe('Value is too small.');
  });
});
