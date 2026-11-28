import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
  },
}));

import { createApp } from '../../src/app.js';
import { API_V1_PREFIX } from '../../src/routes/index.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json';

function createTestApp() {
  return createApp({ logger: pino({ level: 'silent' }) });
}

describe('API versioning', () => {
  it('uses the /api/v1 prefix from the architecture contract', () => {
    expect(API_V1_PREFIX).toBe('/api/v1');
  });

  it('mounts the versioned router and returns Problem Details for an unknown versioned route', async () => {
    const app = createTestApp();

    const response = await request(app)
      .get('/api/v1/unknown-resource')
      .set('X-Request-Id', 'versioned-route-id');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.headers['x-request-id']).toBe('versioned-route-id');
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'The requested resource was not found.',
      instance: '/api/v1/unknown-resource',
      code: 'ROUTE_NOT_FOUND',
      requestId: 'versioned-route-id',
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it.each(['/api/v1', '/api/v1/', '/api/v1/nested/unknown-resource'])(
    'returns Problem Details for the unknown versioned path %s',
    async (path) => {
      const app = createTestApp();

      const response = await request(app).get(path);

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        status: 404,
        code: 'ROUTE_NOT_FOUND',
        instance: path,
      });
    },
  );

  it('returns Problem Details for unknown routes outside the versioned space', async () => {
    const app = createTestApp();

    const response = await request(app).get('/unknown?token=query-secret');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      instance: '/unknown',
    });
    expect(JSON.stringify(response.body)).not.toContain('query-secret');
  });

  it.each(['/api', '/api/v2/events', '/v1/events', '/events'])(
    'does not expose versioned routes outside /api/v1: %s',
    async (path) => {
      const app = createTestApp();

      const response = await request(app).get(path);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: 404,
        code: 'ROUTE_NOT_FOUND',
        instance: path,
      });
    },
  );

  it('keeps Request ID on unknown routes inside and outside the versioned space', async () => {
    const app = createTestApp();

    const versioned = await request(app).get('/api/v1/unknown');
    const unversioned = await request(app).get('/unknown');

    expect(versioned.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
    expect(versioned.body.requestId).toBe(versioned.headers['x-request-id']);
    expect(unversioned.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
    expect(unversioned.body.requestId).toBe(unversioned.headers['x-request-id']);
  });
});

describe('GET /health after route composition', () => {
  it('keeps the operational health endpoint outside /api/v1', async () => {
    const app = createTestApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not expose the health endpoint through the versioned router', async () => {
    const app = createTestApp();

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      instance: '/api/v1/health',
    });
  });
});
