import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_ORIGIN_FORBIDDEN } from '../../../src/modules/auth/auth.errors.js';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  clearRefreshCookie,
  setRefreshCookie,
} from '../../../src/shared/http/cookies.js';
import { assertAllowedOrigin, parseAllowedOrigins } from '../../../src/shared/http/origin.js';

function createRequest(origin: string | undefined): Request {
  return { get: () => origin } as unknown as Request;
}

function createResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();

  return { response: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

describe('origin allowlist', () => {
  it('parses, trims and normalizes configured origins', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins(' https://a.example , https://b.example/ ,, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('accepts an allowed origin', () => {
    expect(() =>
      assertAllowedOrigin(createRequest('https://app.example'), ['https://app.example']),
    ).not.toThrow();
  });

  it('rejects missing, null and unknown origins', () => {
    for (const origin of [undefined, 'null', 'https://evil.example']) {
      let thrown: unknown;

      try {
        assertAllowedOrigin(createRequest(origin), ['https://app.example']);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        code: AUTH_ORIGIN_FORBIDDEN,
        statusCode: 403,
      });
    }
  });
});

describe('refresh cookie', () => {
  it('sets a strict, HttpOnly, scoped cookie', () => {
    const { response, cookie } = createResponse();

    setRefreshCookie(response, 'token', {
      secure: true,
      domain: 'example.com',
      maxAgeSeconds: 604_800,
    });

    expect(cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      domain: 'example.com',
      maxAge: 604_800_000,
    });
  });

  it('omits the domain when not configured', () => {
    const { response, cookie } = createResponse();

    setRefreshCookie(response, 'token', { secure: false, maxAgeSeconds: 60 });

    expect(cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'token',
      expect.not.objectContaining({ domain: expect.anything() }),
    );
  });

  it('clears the cookie with matching attributes', () => {
    const { response, clearCookie } = createResponse();

    clearRefreshCookie(response, { secure: true, domain: 'example.com', maxAgeSeconds: 60 });

    expect(clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      domain: 'example.com',
    });
  });

  it('never emits a non-positive max age', () => {
    const { response, cookie } = createResponse();

    setRefreshCookie(response, 'token', { secure: false, maxAgeSeconds: -5 });

    expect(cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'token',
      expect.objectContaining({ maxAge: 1_000 }),
    );
  });
});
