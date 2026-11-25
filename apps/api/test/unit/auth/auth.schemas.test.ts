import { describe, expect, it } from 'vitest';
import {
  emptyBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  sessionParamsSchema,
  switchOrganizationBodySchema,
} from '../../../src/modules/auth/auth.schemas.js';

const UUID = '33333333-3333-4333-8333-333333333333';

describe('auth schemas', () => {
  it('normalizes login emails and accepts an optional organization', () => {
    expect(
      loginBodySchema.parse({
        email: '  User@Example.COM ',
        password: 'secret',
        organizationId: UUID,
      }),
    ).toEqual({
      email: 'user@example.com',
      password: 'secret',
      organizationId: UUID,
    });

    expect(
      loginBodySchema.parse({ email: 'user@example.com', password: 'secret' }),
    ).not.toHaveProperty('organizationId');
  });

  it('rejects unknown fields and invalid organizations', () => {
    expect(() =>
      loginBodySchema.parse({
        email: 'user@example.com',
        password: 'secret',
        rememberMe: true,
      }),
    ).toThrow();

    expect(() =>
      loginBodySchema.parse({
        email: 'user@example.com',
        password: 'secret',
        organizationId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('accepts login passwords of any length up to the maximum', () => {
    expect(() => loginBodySchema.parse({ email: 'user@example.com', password: 'x' })).not.toThrow();
    expect(() =>
      loginBodySchema.parse({ email: 'user@example.com', password: 'x'.repeat(129) }),
    ).toThrow();
  });

  it('enforces the password reset length policy', () => {
    expect(
      resetPasswordBodySchema.parse({ token: 'x'.repeat(20), newPassword: 'x'.repeat(12) }),
    ).toBeDefined();

    expect(() =>
      resetPasswordBodySchema.parse({ token: 'x'.repeat(20), newPassword: 'short' }),
    ).toThrow();
    expect(() =>
      resetPasswordBodySchema.parse({
        token: 'x'.repeat(20),
        newPassword: 'x'.repeat(129),
      }),
    ).toThrow();
  });

  it('validates reset tokens, switch targets and session ids', () => {
    expect(forgotPasswordBodySchema.parse({ email: 'USER@example.com' })).toEqual({
      email: 'user@example.com',
    });
    expect(() =>
      resetPasswordBodySchema.parse({ token: 'short', newPassword: 'x'.repeat(12) }),
    ).toThrow();
    expect(switchOrganizationBodySchema.parse({ organizationId: UUID })).toEqual({
      organizationId: UUID,
    });
    expect(() => switchOrganizationBodySchema.parse({ organizationId: 'nope' })).toThrow();
    expect(sessionParamsSchema.parse({ sessionId: UUID })).toEqual({ sessionId: UUID });
    expect(() => sessionParamsSchema.parse({ sessionId: 'nope' })).toThrow();
  });

  it('accepts only an empty body for bodyless endpoints', () => {
    expect(emptyBodySchema.parse(undefined)).toEqual({});
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(() => emptyBodySchema.parse({ revoked: true })).toThrow();
  });
});
