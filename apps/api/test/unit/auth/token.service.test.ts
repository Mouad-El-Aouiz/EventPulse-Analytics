import { randomUUID } from 'node:crypto';
import { SignJWT, decodeProtectedHeader, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID } from '../../../src/modules/auth/auth.errors.js';
import {
  TokenService,
  type AccessTokenInput,
} from '../../../src/modules/auth/services/token.service.js';

const SECRET = 'test-jwt-secret-with-more-than-32-characters';
const ISSUER = 'eventpulse-analytics';
const AUDIENCE = 'eventpulse-api';
const KEY_ID = 'primary';
const encoder = new TextEncoder();

const tokens = new TokenService({
  secret: SECRET,
  issuer: ISSUER,
  audience: AUDIENCE,
  keyId: KEY_ID,
  accessTtlSeconds: 900,
});

const input: AccessTokenInput = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  role: 'OWNER',
};

function expectAppError(error: unknown, code: string): void {
  expect(error).toMatchObject({ code, statusCode: 401 });
}

function accessClaims(): Record<string, unknown> {
  return {
    sid: input.sessionId,
    org: input.organizationId,
    role: input.role,
    typ: 'access',
  };
}

interface TokenOverrides {
  kid?: string;
  algorithm?: 'HS256' | 'HS512';
  issuer?: string;
  audience?: string;
  subject?: string | null;
  jti?: string | false;
  issuedAt?: boolean;
  expiresIn?: boolean;
}

async function signWith(
  claims: Record<string, unknown>,
  overrides: TokenOverrides = {},
): Promise<string> {
  let token = new SignJWT(claims).setProtectedHeader({
    alg: overrides.algorithm ?? 'HS256',
    typ: 'JWT',
    kid: overrides.kid ?? KEY_ID,
  });

  if (overrides.subject !== null) {
    token = token.setSubject(overrides.subject ?? input.userId);
  }

  if (overrides.jti !== false) {
    token = token.setJti(overrides.jti ?? randomUUID());
  }

  if (overrides.issuedAt !== false) {
    token = token.setIssuedAt();
  }

  if (overrides.expiresIn !== false) {
    token = token.setExpirationTime('900s');
  }

  return token
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .sign(encoder.encode(SECRET));
}

describe('TokenService', () => {
  it('signs access tokens with strict claims and a key id', async () => {
    const token = await tokens.signAccessToken(input);
    const header = decodeProtectedHeader(token);
    const { payload } = await jwtVerify(token, encoder.encode(SECRET), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT', kid: KEY_ID });
    expect(payload).toMatchObject({
      sub: input.userId,
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
      iss: ISSUER,
      aud: AUDIENCE,
    });
    expect(typeof payload.jti).toBe('string');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900);
  });

  it('verifies a token issued by the service', async () => {
    const token = await tokens.signAccessToken(input);

    await expect(tokens.verifyAccessToken(token)).resolves.toEqual({
      userId: input.userId,
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      roleHint: input.role,
      tokenId: expect.any(String),
    });
  });

  it('rejects a token signed with a different key id', async () => {
    const token = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: 'rotated' })
      .setSubject(input.userId)
      .setJti('jti')
      .setIssuedAt()
      .setExpirationTime('900s')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    await expect(tokens.verifyAccessToken(token)).rejects.toSatisfy((error: unknown) => {
      expectAppError(error, AUTH_TOKEN_INVALID);
      return true;
    });
  });

  it('rejects an expired token with a distinct error code', async () => {
    const token = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setJti('jti')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    await expect(tokens.verifyAccessToken(token)).rejects.toSatisfy((error: unknown) => {
      expectAppError(error, AUTH_TOKEN_EXPIRED);
      return true;
    });
  });

  it('rejects tokens missing required claims', async () => {
    const missingExpiry = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setJti('jti')
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    const missingJti = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setIssuedAt()
      .setExpirationTime('900s')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    const missingIssuedAt = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setJti('jti')
      .setExpirationTime('900s')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    await expect(tokens.verifyAccessToken(missingExpiry)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
    await expect(tokens.verifyAccessToken(missingJti)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
    await expect(tokens.verifyAccessToken(missingIssuedAt)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
  });

  it('rejects tokens with the wrong algorithm, issuer or audience', async () => {
    const wrongAlgorithm = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS512', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setExpirationTime('900s')
      .sign(encoder.encode(SECRET));

    const wrongIssuer = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setExpirationTime('900s')
      .setIssuer('someone-else')
      .sign(encoder.encode(SECRET));

    await expect(tokens.verifyAccessToken(wrongAlgorithm)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
    await expect(tokens.verifyAccessToken(wrongIssuer)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
  });

  it('rejects tokens with malformed or unknown claims', async () => {
    const token = await new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: 'SUPERADMIN',
      typ: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })
      .setSubject(input.userId)
      .setJti('jti')
      .setIssuedAt()
      .setExpirationTime('900s')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(encoder.encode(SECRET));

    await expect(tokens.verifyAccessToken(token)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await signWith(accessClaims(), { audience: 'another-api' });

    await expect(tokens.verifyAccessToken(token)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
  });

  it.each(['sid', 'org', 'role'] as const)(
    'rejects a token missing the %s claim',
    async (claim) => {
      const claims = accessClaims();
      delete claims[claim];

      const token = await signWith(claims);

      await expect(tokens.verifyAccessToken(token)).rejects.toMatchObject({
        code: AUTH_TOKEN_INVALID,
      });
    },
  );

  it('rejects a token missing the subject claim', async () => {
    const token = await signWith(accessClaims(), { subject: null });

    await expect(tokens.verifyAccessToken(token)).rejects.toMatchObject({
      code: AUTH_TOKEN_INVALID,
    });
  });

  it('rejects malformed UUID identity claims', async () => {
    const invalidUuid = 'not-a-uuid';
    const sidClaims = accessClaims();
    sidClaims.sid = invalidUuid;
    const orgClaims = accessClaims();
    orgClaims.org = invalidUuid;

    const malformedSid = await signWith(sidClaims);
    const malformedOrg = await signWith(orgClaims);
    const malformedSubject = await signWith(accessClaims(), { subject: invalidUuid });
    const malformedJti = await signWith(accessClaims(), { jti: invalidUuid });

    for (const token of [malformedSid, malformedOrg, malformedSubject, malformedJti]) {
      await expect(tokens.verifyAccessToken(token)).rejects.toMatchObject({
        code: AUTH_TOKEN_INVALID,
      });
    }
  });

  it('generates high-entropy opaque tokens', () => {
    const first = tokens.generateOpaqueToken();
    const second = tokens.generateOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});
