import type { Request, RequestHandler } from 'express';
import { collectionResponse, singleResponse } from '../../http/responses.js';
import { setRefreshCookie } from '../../shared/http/cookies.js';
import { authenticationRequiredError, forbiddenError } from '../../shared/http/authorization.js';
import type { ActorContext, AuthContext } from '../../shared/types/actor-context.js';
import type {
  AcceptInvitationBody,
  AcceptInvitationWithTokenBody,
  ApiKeyParams,
  CreateApiKeyBody,
  CreateInvitationBody,
  InvitationParams,
  MembershipParams,
  RotateApiKeyBody,
  UpdateMembershipBody,
  UpdateOrganizationBody,
} from './organizations.schemas.js';
import type { RequestMetadata } from './organizations.types.js';
import type { ApiKeyService } from './services/api-key.service.js';
import type { InvitationService } from './services/invitation.service.js';
import type { MembershipService } from './services/membership.service.js';
import type { OrganizationService } from './services/organization.service.js';

const MAX_USER_AGENT_LENGTH = 1000;

function requestMetadata(req: Request): RequestMetadata {
  const userAgent = req.get('user-agent');

  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
  };
}

function requireActor(req: Request): ActorContext {
  if (req.actor === undefined) {
    throw forbiddenError();
  }

  return req.actor;
}

function requireAuth(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw authenticationRequiredError();
  }

  return req.auth;
}

export interface OrganizationsControllerOptions {
  organizations: OrganizationService;
  memberships: MembershipService;
  invitations: InvitationService;
  apiKeys: ApiKeyService;
  cookie: { secure: boolean; domain?: string };
}

export class OrganizationsController {
  constructor(private readonly options: OrganizationsControllerOptions) {}

  readonly listOrganizations: RequestHandler = async (req, res) => {
    const memberships = await this.options.organizations.listForUser(requireAuth(req).userId);
    res.status(200).json(collectionResponse(memberships));
  };

  readonly getCurrentOrganization: RequestHandler = async (req, res) => {
    const organization = await this.options.organizations.getCurrent(requireActor(req));
    res.status(200).json(singleResponse(organization));
  };

  readonly updateCurrentOrganization: RequestHandler = async (req, res) => {
    const organization = await this.options.organizations.update(
      requireActor(req),
      req.body as UpdateOrganizationBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(organization));
  };

  readonly listMembers: RequestHandler = async (req, res) => {
    const members = await this.options.memberships.list(requireActor(req));
    res.status(200).json(collectionResponse(members));
  };

  readonly updateMember: RequestHandler = async (req, res) => {
    const { membershipId } = req.params as MembershipParams;
    const member = await this.options.memberships.update(
      requireActor(req),
      membershipId,
      req.body as UpdateMembershipBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(member));
  };

  readonly removeMember: RequestHandler = async (req, res) => {
    const { membershipId } = req.params as MembershipParams;
    await this.options.memberships.remove(requireActor(req), membershipId, requestMetadata(req));

    res.status(204).send();
  };

  readonly listInvitations: RequestHandler = async (req, res) => {
    const invitations = await this.options.invitations.list(requireActor(req));
    res.status(200).json(collectionResponse(invitations));
  };

  readonly createInvitation: RequestHandler = async (req, res) => {
    const invitation = await this.options.invitations.create(
      requireActor(req),
      req.body as CreateInvitationBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(invitation));
  };

  readonly revokeInvitation: RequestHandler = async (req, res) => {
    const { invitationId } = req.params as InvitationParams;
    await this.options.invitations.revoke(requireActor(req), invitationId, requestMetadata(req));

    res.status(204).send();
  };

  readonly acceptInvitation: RequestHandler = async (req, res) => {
    const { token } = req.body as AcceptInvitationBody;
    const accepted = await this.options.invitations.accept(
      requireAuth(req),
      token,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(accepted));
  };

  readonly acceptInvitationWithToken: RequestHandler = async (req, res) => {
    const accepted = await this.options.invitations.acceptWithToken(
      req.body as AcceptInvitationWithTokenBody,
      requestMetadata(req),
    );

    setRefreshCookie(res, accepted.refreshToken, {
      secure: this.options.cookie.secure,
      domain: this.options.cookie.domain,
      maxAgeSeconds: accepted.refreshMaxAgeSeconds,
    });

    res.status(200).json(singleResponse(accepted.body));
  };

  readonly listApiKeys: RequestHandler = async (req, res) => {
    const apiKeys = await this.options.apiKeys.list(requireActor(req));
    res.status(200).json(collectionResponse(apiKeys));
  };

  readonly createApiKey: RequestHandler = async (req, res) => {
    const apiKey = await this.options.apiKeys.create(
      requireActor(req),
      req.body as CreateApiKeyBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(apiKey));
  };

  readonly revokeApiKey: RequestHandler = async (req, res) => {
    const { keyId } = req.params as ApiKeyParams;
    await this.options.apiKeys.revoke(requireActor(req), keyId, requestMetadata(req));
    res.status(204).send();
  };

  readonly rotateApiKey: RequestHandler = async (req, res) => {
    const { keyId } = req.params as ApiKeyParams;
    const rotated = await this.options.apiKeys.rotate(
      requireActor(req),
      keyId,
      req.body as RotateApiKeyBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(rotated));
  };
}
