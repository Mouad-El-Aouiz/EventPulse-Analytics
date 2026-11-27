import type { ApiKey } from '@prisma/client';
import type { DatabaseClient } from './database.js';

export interface CreateApiKeyRecord {
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  createdByUserId: string;
  expiresAt?: Date | null;
}

export class ApiKeyRepository {
  constructor(private readonly client: DatabaseClient) {}

  list(organizationId: string): Promise<ApiKey[]> {
    return this.client.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(
    organizationId: string,
    keyId: string,
    tx: DatabaseClient = this.client,
  ): Promise<ApiKey | null> {
    return tx.apiKey.findFirst({ where: { id: keyId, organizationId } });
  }

  findByHash(keyHash: string, tx: DatabaseClient = this.client): Promise<ApiKey | null> {
    return tx.apiKey.findUnique({ where: { keyHash } });
  }

  async lockById(
    organizationId: string,
    keyId: string,
    tx: DatabaseClient = this.client,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM "api_keys"
      WHERE "id" = CAST(${keyId} AS uuid)
        AND "organization_id" = CAST(${organizationId} AS uuid)
      FOR UPDATE
    `;
  }

  create(input: CreateApiKeyRecord, tx: DatabaseClient = this.client): Promise<ApiKey> {
    return tx.apiKey.create({ data: input });
  }

  async revoke(
    organizationId: string,
    keyId: string,
    revokedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.apiKey.updateMany({
      where: { id: keyId, organizationId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt },
    });

    return result.count;
  }

  async touchLastUsed(
    organizationId: string,
    keyId: string,
    lastUsedAt: Date,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    const result = await tx.apiKey.updateMany({
      where: {
        id: keyId,
        organizationId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: lastUsedAt } }],
      },
      data: { lastUsedAt },
    });

    return result.count;
  }
}
