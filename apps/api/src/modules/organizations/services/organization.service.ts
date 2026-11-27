import type { Logger } from 'pino';
import { sanitizedErrorFields } from '../../../errors/error-logging.js';
import type { AuditEvent, AuditPort } from '../../../shared/ports/audit.port.js';
import type {
  OrganizationSettings,
  OrganizationsFacade,
  UserOrganization,
} from '../../../shared/contracts/organizations-facade.js';
import type { ActorContext } from '../../../shared/types/actor-context.js';
import { forbiddenError } from '../../../shared/http/authorization.js';
import { organizationNotFoundError } from '../organizations.errors.js';
import type {
  OrganizationView,
  RequestMetadata,
  UpdateOrganizationInput,
} from '../organizations.types.js';
import type { OrganizationRepository } from '../repositories/organization.repository.js';
import type { MembershipRepository } from '../repositories/membership.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../repositories/organizations-unit-of-work.js';

export interface OrganizationServiceOptions {
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  unitOfWork: PrismaOrganizationsUnitOfWork;
  facade: OrganizationsFacade;
  audit: AuditPort;
  logger: Logger;
}

const OWNER_ONLY_FIELDS = new Set(['slug', 'currency']);

export class OrganizationService {
  constructor(private readonly options: OrganizationServiceOptions) {}

  listForUser(userId: string): Promise<UserOrganization[]> {
    return this.options.facade.listUserOrganizations(userId);
  }

  async getCurrent(actor: ActorContext): Promise<OrganizationView> {
    const settings = await this.options.facade.getSettings(actor.organizationId);

    if (settings === null) {
      throw organizationNotFoundError();
    }

    return this.toView(settings, actor.role);
  }

  async update(
    actor: ActorContext,
    input: UpdateOrganizationInput,
    metadata: RequestMetadata,
  ): Promise<OrganizationView> {
    if (actor.role !== 'OWNER' && Object.keys(input).some((key) => OWNER_ONLY_FIELDS.has(key))) {
      throw forbiddenError();
    }

    const result = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);

      const actorMembership = await this.options.memberships.findById(
        actor.organizationId,
        actor.membershipId,
        tx,
      );

      if (actorMembership === null || actorMembership.status !== 'ACTIVE') {
        throw forbiddenError();
      }

      if (
        actorMembership.role !== 'OWNER' &&
        Object.keys(input).some((key) => OWNER_ONLY_FIELDS.has(key))
      ) {
        throw forbiddenError();
      }

      const before = await this.options.organizations.findById(actor.organizationId, tx);

      if (before === null) {
        throw organizationNotFoundError();
      }

      const updated = await this.options.organizations.update(actor.organizationId, input, tx);
      const changedFields = Object.keys(input).filter(
        (key) => before[key as keyof typeof before] !== updated[key as keyof typeof updated],
      );

      return { before, updated, changedFields, actorRole: actorMembership.role };
    });

    if (result.changedFields.length > 0) {
      await this.recordAudit({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        category: 'ORGANIZATION',
        actionType: 'ORGANIZATION_SETTINGS_UPDATED',
        resourceType: 'organization',
        resourceId: actor.organizationId,
        result: 'SUCCESS',
        metadata: { fields: result.changedFields },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return this.toView(result.updated, result.actorRole);
  }

  private toView(settings: OrganizationSettings, role: ActorContext['role']): OrganizationView {
    return {
      id: settings.id,
      name: settings.name,
      slug: settings.slug,
      timezone: settings.timezone,
      currency: settings.currency,
      exportRetentionDays: settings.exportRetentionDays,
      role,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  private async recordAudit(event: AuditEvent): Promise<void> {
    try {
      await this.options.audit.record(event);
    } catch (error) {
      this.options.logger.error(
        sanitizedErrorFields(error),
        'Failed to record organization audit event',
      );
    }
  }
}
