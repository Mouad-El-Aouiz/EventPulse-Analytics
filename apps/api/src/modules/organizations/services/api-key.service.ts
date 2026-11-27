import { randomBytes } from 'node:crypto';
import type { ApiKey, Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { sanitizedErrorFields } from '../../../errors/error-logging.js';
import { hashTokenWithPepper } from '../../../shared/crypto/token-hash.js';
import { forbiddenError } from '../../../shared/http/authorization.js';
import type { AuditEvent, AuditPort } from '../../../shared/ports/audit.port.js';
import type { Clock } from '../../../shared/ports/clock.port.js';
import type { ActorContext } from '../../../shared/types/actor-context.js';
import {
  apiKeyExpiryInvalidError,
  apiKeyNotActiveError,
  apiKeyNotFoundError,
  apiKeyScopesInvalidError,
} from '../organizations.errors.js';
import type {
  ApiKeyView,
  CreateApiKeyInput,
  CreatedApiKeyView,
  RequestMetadata,
  RotatedApiKeyView,
  RotateApiKeyInput,
} from '../organizations.types.js';
import type { ApiKeyRepository } from '../repositories/api-key.repository.js';
import type { MembershipRepository } from '../repositories/membership.repository.js';
import type { OrganizationRepository } from '../repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../repositories/organizations-unit-of-work.js';

export const API_KEY_SCOPE_INGESTION_WRITE = 'ingestion:write';
const ALLOWED_SCOPES = new Set([API_KEY_SCOPE_INGESTION_WRITE]);
const KEY_PREFIX_BYTES = 6;
const KEY_SECRET_BYTES = 32;

export interface ApiKeyPrincipal {
  apiKeyId: string;
  organizationId: string;
  scopes: readonly string[];
}

export interface ApiKeyServiceOptions {
  apiKeys: ApiKeyRepository;
  memberships: MembershipRepository;
  organizations: OrganizationRepository;
  unitOfWork: PrismaOrganizationsUnitOfWork;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
  keyPepper: string;
}

interface KeyMaterial {
  keyPrefix: string;
  rawKey: string;
  keyHash: string;
}

function generateKeyMaterial(pepper: string): KeyMaterial {
  const keyPrefix = `epk_${randomBytes(KEY_PREFIX_BYTES).toString('hex')}`;
  const secret = randomBytes(KEY_SECRET_BYTES).toString('hex');
  const rawKey = `${keyPrefix}_${secret}`;

  return {
    keyPrefix,
    rawKey,
    keyHash: hashTokenWithPepper(rawKey, pepper),
  };
}

export class ApiKeyService {
  constructor(private readonly options: ApiKeyServiceOptions) {}

  async list(actor: ActorContext): Promise<ApiKeyView[]> {
    const keys = await this.options.apiKeys.list(actor.organizationId);

    return keys.map((key) => this.toView(key));
  }

  async create(
    actor: ActorContext,
    input: CreateApiKeyInput,
    metadata: RequestMetadata,
  ): Promise<CreatedApiKeyView> {
    this.assertValidScopes(input.scopes);

    const now = this.options.clock.now();
    this.assertFutureExpiry(input.expiresAt, now);

    const material = generateKeyMaterial(this.options.keyPepper);

    const apiKey = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);
      await this.assertManager(actor, tx);

      return this.options.apiKeys.create(
        {
          organizationId: actor.organizationId,
          name: input.name,
          keyPrefix: material.keyPrefix,
          keyHash: material.keyHash,
          scopes: input.scopes,
          createdByUserId: actor.userId,
          expiresAt: input.expiresAt ?? null,
        },
        tx,
      );
    });

    await this.recordAudit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType: 'API_KEY_CREATED',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      result: 'SUCCESS',
      metadata: {
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return { ...this.toView(apiKey), secret: material.rawKey };
  }

  async revoke(actor: ActorContext, keyId: string, metadata: RequestMetadata): Promise<void> {
    const now = this.options.clock.now();

    const outcome = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);
      await this.assertManager(actor, tx);
      await this.options.apiKeys.lockById(actor.organizationId, keyId, tx);

      const apiKey = await this.options.apiKeys.findById(actor.organizationId, keyId, tx);

      if (apiKey === null) {
        throw apiKeyNotFoundError();
      }

      const revoked = await this.options.apiKeys.revoke(actor.organizationId, keyId, now, tx);

      return { apiKey, changed: revoked === 1 };
    });

    if (!outcome.changed) {
      return;
    }

    await this.recordAudit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType: 'API_KEY_REVOKED',
      resourceType: 'api_key',
      resourceId: keyId,
      result: 'SUCCESS',
      metadata: { keyPrefix: outcome.apiKey.keyPrefix },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async rotate(
    actor: ActorContext,
    keyId: string,
    input: RotateApiKeyInput,
    metadata: RequestMetadata,
  ): Promise<RotatedApiKeyView> {
    const now = this.options.clock.now();
    this.assertFutureExpiry(input.expiresAt, now);

    const material = generateKeyMaterial(this.options.keyPepper);

    const outcome = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);
      await this.assertManager(actor, tx);
      await this.options.apiKeys.lockById(actor.organizationId, keyId, tx);

      const previous = await this.options.apiKeys.findById(actor.organizationId, keyId, tx);

      if (previous === null) {
        throw apiKeyNotFoundError();
      }

      if (
        previous.status !== 'ACTIVE' ||
        (previous.expiresAt !== null && previous.expiresAt.getTime() <= now.getTime())
      ) {
        throw apiKeyNotActiveError();
      }

      const revoked = await this.options.apiKeys.revoke(actor.organizationId, keyId, now, tx);

      if (revoked !== 1) {
        throw apiKeyNotActiveError();
      }

      const created = await this.options.apiKeys.create(
        {
          organizationId: actor.organizationId,
          name: input.name ?? previous.name,
          keyPrefix: material.keyPrefix,
          keyHash: material.keyHash,
          scopes: previous.scopes,
          createdByUserId: actor.userId,
          expiresAt: input.expiresAt ?? previous.expiresAt,
        },
        tx,
      );

      return { previous, created };
    });

    await this.recordAudit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType: 'API_KEY_ROTATED',
      resourceType: 'api_key',
      resourceId: outcome.created.id,
      result: 'SUCCESS',
      metadata: {
        previousKeyId: outcome.previous.id,
        previousKeyPrefix: outcome.previous.keyPrefix,
        keyPrefix: outcome.created.keyPrefix,
        scopes: outcome.created.scopes,
        expiresAt: outcome.created.expiresAt?.toISOString() ?? null,
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      ...this.toView(outcome.created),
      secret: material.rawKey,
      replacedKeyId: outcome.previous.id,
    };
  }

  async validate(rawKey: string): Promise<ApiKeyPrincipal | null> {
    const keyHash = hashTokenWithPepper(rawKey, this.options.keyPepper);
    const apiKey = await this.options.apiKeys.findByHash(keyHash);

    if (apiKey === null || apiKey.status !== 'ACTIVE') {
      return null;
    }

    const now = this.options.clock.now();

    if (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    if (!apiKey.scopes.includes(API_KEY_SCOPE_INGESTION_WRITE)) {
      return null;
    }

    try {
      const touched = await this.options.apiKeys.touchLastUsed(
        apiKey.organizationId,
        apiKey.id,
        now,
      );

      if (touched !== 1) {
        return null;
      }
    } catch (error) {
      this.options.logger.warn(
        { ...sanitizedErrorFields(error), apiKeyId: apiKey.id },
        'Failed to update API key last-used timestamp',
      );
    }

    return {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      scopes: apiKey.scopes,
    };
  }

  private async assertManager(actor: ActorContext, tx: Prisma.TransactionClient): Promise<void> {
    const membership = await this.options.memberships.findById(
      actor.organizationId,
      actor.membershipId,
      tx,
    );

    if (
      membership === null ||
      membership.status !== 'ACTIVE' ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
    ) {
      throw forbiddenError();
    }
  }

  private assertValidScopes(scopes: readonly string[]): void {
    const unique = new Set(scopes);

    if (
      scopes.length === 0 ||
      unique.size !== scopes.length ||
      scopes.some((scope) => !ALLOWED_SCOPES.has(scope))
    ) {
      throw apiKeyScopesInvalidError();
    }
  }

  private assertFutureExpiry(expiresAt: Date | undefined, now: Date): void {
    if (
      expiresAt !== undefined &&
      (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime())
    ) {
      throw apiKeyExpiryInvalidError();
    }
  }

  private toView(apiKey: ApiKey): ApiKeyView {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      status: apiKey.status,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    };
  }

  private async recordAudit(event: AuditEvent): Promise<void> {
    try {
      await this.options.audit.record(event);
    } catch (error) {
      this.options.logger.error(
        sanitizedErrorFields(error),
        'Failed to record API key audit event',
      );
    }
  }
}
