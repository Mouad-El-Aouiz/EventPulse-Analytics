import { randomBytes, randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { AuthContext } from '../../../shared/types/actor-context.js';
import { tokenExpiredError, tokenInvalidError } from '../auth.errors.js';

const ALGORITHM = 'HS256';
const TOKEN_TYPE = 'access';
const VALID_ROLES = new Set<string>(['OWNER', 'ADMIN', 'EVENT_MANAGER', 'ANALYST', 'VIEWER']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface TokenServiceOptions {
  secret: string;
  issuer: string;
  audience: string;
  keyId: string;
  accessTtlSeconds: number;
}

export interface AccessTokenInput {
  userId: string;
  sessionId: string;
  organizationId: string;
  role: Role;
}

export class TokenService {
  private readonly secret: Uint8Array;
  private readonly options: TokenServiceOptions;

  constructor(options: TokenServiceOptions) {
    this.options = options;
    this.secret = new TextEncoder().encode(options.secret);
  }

  get accessTtlSeconds(): number {
    return this.options.accessTtlSeconds;
  }

  async signAccessToken(input: AccessTokenInput): Promise<string> {
    return new SignJWT({
      sid: input.sessionId,
      org: input.organizationId,
      role: input.role,
      typ: TOKEN_TYPE,
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT', kid: this.options.keyId })
      .setSubject(input.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.options.accessTtlSeconds}s`)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.secret, {
        algorithms: [ALGORITHM],
        issuer: this.options.issuer,
        audience: this.options.audience,
        requiredClaims: ['exp', 'iat', 'sub', 'sid', 'org', 'role', 'jti'],
      });

      if (protectedHeader.kid !== this.options.keyId) {
        throw tokenInvalidError();
      }

      const { sub, sid, org, role, jti, typ } = payload;

      if (
        typ !== TOKEN_TYPE ||
        typeof sub !== 'string' ||
        typeof sid !== 'string' ||
        typeof org !== 'string' ||
        typeof role !== 'string' ||
        !VALID_ROLES.has(role) ||
        typeof jti !== 'string' ||
        !isUuid(sub) ||
        !isUuid(sid) ||
        !isUuid(org) ||
        !isUuid(jti)
      ) {
        throw tokenInvalidError();
      }

      return {
        userId: sub,
        sessionId: sid,
        organizationId: org,
        roleHint: role as Role,
        tokenId: jti,
      };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw tokenExpiredError(error);
      }

      if (error instanceof Error && 'statusCode' in error) {
        throw error;
      }

      throw tokenInvalidError(error);
    }
  }

  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
