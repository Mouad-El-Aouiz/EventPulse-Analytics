import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/errors/app-error.js';

describe('AppError', () => {
  it('constructs an operational application error with its public fields', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      publicDetail: 'The requested event does not exist.',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Event not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('EVENT_NOT_FOUND');
    expect(error.publicDetail).toBe('The requested event does not exist.');
    expect(error.isOperational).toBe(true);
  });

  it('marks errors as non-operational when explicitly requested', () => {
    const error = new AppError('Unexpected invariant violation', {
      statusCode: 500,
      code: 'INVARIANT_VIOLATION',
      isOperational: false,
    });

    expect(error.isOperational).toBe(false);
  });

  it('stores the native cause without changing the public detail', () => {
    const cause = new Error('database connection failed');
    const error = new AppError('Unable to load event', {
      statusCode: 500,
      code: 'EVENT_LOAD_FAILED',
      publicDetail: 'The event could not be loaded.',
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.publicDetail).toBe('The event could not be loaded.');
  });

  it('leaves the cause and public detail undefined when they are not provided', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
    });

    expect(error.cause).toBeUndefined();
    expect(error.publicDetail).toBeUndefined();
  });

  it('provides a stack trace containing the error type and message', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
    });

    const stack = error.stack ?? '';

    expect(stack).toContain('AppError');
    expect(stack).toContain('Event not found');
  });

  it('preserves the prototype and name for subclasses', () => {
    class NotFoundError extends AppError {}

    const error = new NotFoundError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
    });

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('NotFoundError');
  });
});
