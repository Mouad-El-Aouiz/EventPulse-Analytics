import express, { type Request, type Response } from 'express';
import pino, { type Logger } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
  },
}));

import { errorHandler } from '../../src/middleware/error-handler.js';
import { requestLogger } from '../../src/middleware/request-logger.js';
import { validateRequest } from '../../src/middleware/validate-request.js';

const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json';

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    email: z.string().email(),
    password: z.string().min(12),
  })
  .strict();

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100),
    search: z.string().min(2).optional(),
  })
  .strict();

const allBodySchema = z.object({
  name: z.string().min(1),
});

type LogEntry = Record<string, unknown>;

function createCapturedLogger(): { logger: Logger; entries: () => LogEntry[] } {
  const lines: string[] = [];

  const logger = pino(
    {
      level: 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    {
      write(message: string): void {
        lines.push(message);
      },
    },
  );

  return {
    logger,
    entries: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}

function createValidationTestContext() {
  const { logger, entries } = createCapturedLogger();

  const handlers = {
    body: vi.fn((req: Request, res: Response) => {
      res.status(200).json({ body: req.body });
    }),
    params: vi.fn((req: Request, res: Response) => {
      res.status(200).json({ params: req.params });
    }),
    query: vi.fn((req: Request, res: Response) => {
      res.status(200).json({ query: req.query });
    }),
    all: vi.fn((req: Request, res: Response) => {
      res.status(200).json({
        body: req.body,
        params: req.params,
        query: req.query,
      });
    }),
    unexpected: vi.fn(() => {
      throw new Error('database failure at /srv/app/secret.ts with password=secret-token');
    }),
  };

  const app = express();

  app.use(requestLogger({ logger }));
  app.use(express.json());
  app.post('/validation/body', validateRequest({ body: bodySchema }), handlers.body);
  app.get('/validation/params/:id', validateRequest({ params: paramsSchema }), handlers.params);
  app.get('/validation/query', validateRequest({ query: querySchema }), handlers.query);
  app.post(
    '/validation/all/:id',
    validateRequest({
      body: allBodySchema,
      params: paramsSchema,
      query: querySchema,
    }),
    handlers.all,
  );
  app.get('/validation/unexpected', handlers.unexpected);
  app.use(errorHandler);

  return { app, entries, handlers };
}

describe('validateRequest with valid input', () => {
  it('validates and exposes a parsed body to the route handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).post('/validation/body?unvalidated=anything').send({
      name: '  Ada  ',
      email: 'ada@example.com',
      password: 'valid-password',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      body: {
        name: 'Ada',
        email: 'ada@example.com',
        password: 'valid-password',
      },
    });
    expect(handlers.body).toHaveBeenCalledTimes(1);
  });

  it('validates and exposes parsed route params to the route handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).get('/validation/params/42');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ params: { id: 42 } });
    expect(handlers.params).toHaveBeenCalledTimes(1);
  });

  it('validates and exposes parsed query parameters to the route handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).get('/validation/query?limit=25&search=analytics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ query: { limit: 25, search: 'analytics' } });
    expect(handlers.query).toHaveBeenCalledTimes(1);
  });

  it('validates body, params and query together when all schemas are configured', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app)
      .post('/validation/all/7?limit=10&search=ada')
      .send({ name: 'Ada' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      body: { name: 'Ada' },
      params: { id: 7 },
      query: { limit: 10, search: 'ada' },
    });
    expect(handlers.all).toHaveBeenCalledTimes(1);
  });
});

describe('validateRequest with invalid input', () => {
  it('returns Problem Details for an invalid body and does not call the handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app)
      .post('/validation/body')
      .set('X-Request-Id', 'validation-body-id')
      .send({
        name: '',
        email: 'not-an-email',
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.headers['x-request-id']).toBe('validation-body-id');
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'The request contains invalid data.',
      instance: '/validation/body',
      code: 'VALIDATION_ERROR',
      requestId: 'validation-body-id',
      errors: [
        {
          path: 'body.name',
          code: 'too_small',
          message: 'Value is too small.',
        },
        {
          path: 'body.email',
          code: 'invalid_format',
          message: 'Invalid email format.',
        },
        {
          path: 'body.password',
          code: 'too_small',
          message: 'Value is too small.',
        },
      ],
    });
    expect(handlers.body).not.toHaveBeenCalled();
  });

  it('returns Problem Details for invalid route params and does not call the handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).get('/validation/params/0');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/validation/params/0',
      errors: [
        {
          path: 'params.id',
          code: 'too_small',
          message: 'Value is too small.',
        },
      ],
    });
    expect(handlers.params).not.toHaveBeenCalled();
  });

  it('returns Problem Details for invalid query parameters and does not call the handler', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).get('/validation/query?limit=0&search=a');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/validation/query',
      errors: [
        {
          path: 'query.limit',
          code: 'too_small',
          message: 'Value is too small.',
        },
        {
          path: 'query.search',
          code: 'too_small',
          message: 'Value is too small.',
        },
      ],
    });
    expect(handlers.query).not.toHaveBeenCalled();
  });

  it('reports unknown body fields with their field path', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).post('/validation/body').send({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'valid-password',
      unexpectedField: 'value',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [
        {
          path: 'body.unexpectedField',
          code: 'unrecognized_keys',
          message: 'Unrecognized field.',
        },
      ],
    });
    expect(handlers.body).not.toHaveBeenCalled();
  });

  it('aggregates issues from multiple validated request sections', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).post('/validation/all/0?limit=0').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [
        {
          path: 'body.name',
          code: 'invalid_type',
          message: 'Invalid value.',
        },
        {
          path: 'params.id',
          code: 'too_small',
          message: 'Value is too small.',
        },
        {
          path: 'query.limit',
          code: 'too_small',
          message: 'Value is too small.',
        },
      ],
    });
    expect(handlers.all).not.toHaveBeenCalled();
  });

  it('preserves the Request ID and never exposes submitted sensitive values', async () => {
    const { app, entries } = createValidationTestContext();

    const response = await request(app)
      .post('/validation/body')
      .set('X-Request-Id', 'validation-sensitive-id')
      .send({
        name: 'Ada',
        email: 'secret-value@',
        password: 'topsecret',
      });

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBe('validation-sensitive-id');
    expect(response.body.requestId).toBe('validation-sensitive-id');

    const serializedResponse = JSON.stringify(response.body);
    const serializedLogs = JSON.stringify(entries());

    expect(serializedResponse).not.toContain('secret-value@');
    expect(serializedResponse).not.toContain('topsecret');
    expect(serializedLogs).not.toContain('secret-value@');
    expect(serializedLogs).not.toContain('topsecret');
    expect(serializedLogs).not.toContain('"input"');
  });

  it('keeps unexpected errors on the existing internal-server-error path', async () => {
    const { app, handlers } = createValidationTestContext();

    const response = await request(app).get('/validation/unexpected');

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      instance: '/validation/unexpected',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-token');
    expect(JSON.stringify(response.body)).not.toContain('/srv/app');
    expect(handlers.unexpected).toHaveBeenCalledTimes(1);
  });
});
