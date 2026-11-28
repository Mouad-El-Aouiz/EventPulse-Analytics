import type { Request } from 'express';
import { authenticationRequiredError, forbiddenError } from './authorization.js';
import type { ActorContext } from '../types/actor-context.js';

const MAX_USER_AGENT_LENGTH = 1000;

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export function requireActor(req: Request): ActorContext {
  if (req.actor === undefined) {
    throw forbiddenError();
  }

  return req.actor;
}

export function requireAuthenticatedRequest(req: Request): ActorContext {
  if (req.actor === undefined) {
    throw authenticationRequiredError();
  }

  return req.actor;
}

export function requestMetadata(req: Request): RequestMetadata {
  const userAgent = req.get('user-agent');

  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
  };
}
