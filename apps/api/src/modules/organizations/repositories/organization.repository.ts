import { Prisma, type Organization } from '@prisma/client';
import { organizationSlugTakenError } from '../organizations.errors.js';
import type { DatabaseClient } from './database.js';

export interface OrganizationSettingsUpdate {
  name?: string;
  slug?: string;
  timezone?: string;
  currency?: 'EUR';
  exportRetentionDays?: number;
}

export class OrganizationRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  findById(id: string, tx: DatabaseClient = this.client): Promise<Organization | null> {
    return tx.organization.findUnique({ where: { id } });
  }

  async lockById(id: string, tx: DatabaseClient = this.client): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "organizations" WHERE "id" = CAST(${id} AS uuid) FOR UPDATE`;
  }

  async update(
    id: string,
    data: OrganizationSettingsUpdate,
    tx: DatabaseClient = this.client,
  ): Promise<Organization> {
    try {
      return await tx.organization.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw organizationSlugTakenError();
      }

      throw error;
    }
  }
}
