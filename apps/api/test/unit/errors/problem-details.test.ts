import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/errors/app-error.js';
import {
  DEFAULT_PROBLEM_TYPE,
  INTERNAL_SERVER_ERROR_CODE,
  PROBLEM_DETAILS_MEDIA_TYPE,
  mapAppErrorToProblemDetails,
  mapErrorToProblemDetails,
} from '../../../src/errors/problem-details.js';

describe('Problem Details', () => {
  it('exposes the application/problem+json media type', () => {
    expect(PROBLEM_DETAILS_MEDIA_TYPE).toBe('application/problem+json');
  });

  it('maps an AppError to standard and extension fields', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      publicDetail: 'The requested event does not exist.',
    });

    expect(
      mapAppErrorToProblemDetails(error, {
        requestId: 'req-123',
        instance: '/api/v1/events/42',
      }),
    ).toEqual({
      type: DEFAULT_PROBLEM_TYPE,
      title: 'Not Found',
      status: 404,
      detail: 'The requested event does not exist.',
      instance: '/api/v1/events/42',
      code: 'EVENT_NOT_FOUND',
      requestId: 'req-123',
    });
  });

  it('omits optional detail, instance, and requestId when absent', () => {
    const error = new AppError('Event conflict', {
      statusCode: 409,
      code: 'EVENT_CONFLICT',
    });

    const problem = mapAppErrorToProblemDetails(error);

    expect(problem).toEqual({
      type: DEFAULT_PROBLEM_TYPE,
      title: 'Conflict',
      status: 409,
      code: 'EVENT_CONFLICT',
    });
    expect(problem).not.toHaveProperty('detail');
    expect(problem).not.toHaveProperty('instance');
    expect(problem).not.toHaveProperty('requestId');
    expect(JSON.stringify(problem)).not.toContain('Event conflict');
  });

  it('supports request ID and instance independently', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
    });

    const withRequestId = mapAppErrorToProblemDetails(error, { requestId: 'req-404' });
    const withInstance = mapAppErrorToProblemDetails(error, {
      instance: '/api/v1/events/404',
    });

    expect(withRequestId).toMatchObject({ requestId: 'req-404' });
    expect(withRequestId).not.toHaveProperty('instance');
    expect(withInstance).toMatchObject({ instance: '/api/v1/events/404' });
    expect(withInstance).not.toHaveProperty('requestId');
  });

  it('falls back to a generic title for an unknown status code', () => {
    const error = new AppError('Non-standard error', {
      statusCode: 599,
      code: 'NON_STANDARD_ERROR',
    });

    expect(mapAppErrorToProblemDetails(error).title).toBe('Error');
  });

  it('maps unexpected native errors to a generic internal-server-error representation', () => {
    const error = new Error('database password=secret-token at /srv/app/db.ts');
    error.stack = 'INTERNAL STACK /srv/app/db.ts secret-token';

    const problem = mapErrorToProblemDetails(error, {
      requestId: 'req-500',
      instance: '/api/v1/events',
    });

    expect(problem).toEqual({
      type: DEFAULT_PROBLEM_TYPE,
      title: 'Internal Server Error',
      status: 500,
      instance: '/api/v1/events',
      code: INTERNAL_SERVER_ERROR_CODE,
      requestId: 'req-500',
    });
    expect(problem).not.toHaveProperty('detail');
    expect(problem).not.toHaveProperty('stack');

    const serialized = JSON.stringify(problem);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('/srv/app');
    expect(serialized).not.toContain('INTERNAL STACK');
  });

  it('treats non-Error values as unexpected errors', () => {
    expect(mapErrorToProblemDetails('password=secret-token')).toEqual({
      type: DEFAULT_PROBLEM_TYPE,
      title: 'Internal Server Error',
      status: 500,
      code: INTERNAL_SERVER_ERROR_CODE,
    });
  });

  it('maps AppError instances through the unified mapper', () => {
    const error = new AppError('Event not found', {
      statusCode: 404,
      code: 'EVENT_NOT_FOUND',
      publicDetail: 'The requested event does not exist.',
    });
    const context = {
      requestId: 'req-404',
      instance: '/api/v1/events/404',
    };

    expect(mapErrorToProblemDetails(error, context)).toEqual(
      mapAppErrorToProblemDetails(error, context),
    );
  });

  it('does not expose AppError internals or arbitrary properties', () => {
    const cause = new Error('database password=secret-token at /srv/app/db.ts');
    const error = new AppError('Unable to load event from /srv/app/events.ts', {
      statusCode: 500,
      code: 'EVENT_LOAD_FAILED',
      publicDetail: 'The event could not be loaded.',
      cause,
    });

    Object.assign(error, {
      internalPath: '/srv/app/events.ts',
      token: 'arbitrary-secret',
    });

    const problem = mapAppErrorToProblemDetails(error, { requestId: 'req-123' });

    expect(problem).toEqual({
      type: DEFAULT_PROBLEM_TYPE,
      title: 'Internal Server Error',
      status: 500,
      detail: 'The event could not be loaded.',
      code: 'EVENT_LOAD_FAILED',
      requestId: 'req-123',
    });
    expect(problem).not.toHaveProperty('stack');
    expect(problem).not.toHaveProperty('cause');
    expect(problem).not.toHaveProperty('internalPath');
    expect(problem).not.toHaveProperty('token');

    const serialized = JSON.stringify(problem);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('/srv/app');
    expect(serialized).not.toContain('Unable to load event');
    expect(serialized).not.toContain('arbitrary-secret');
  });
});
