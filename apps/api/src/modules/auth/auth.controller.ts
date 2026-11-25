import type { Request, RequestHandler, Response } from 'express';
import { collectionResponse, singleResponse } from '../../http/responses.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from '../../shared/http/cookies.js';
import { assertAllowedOrigin } from '../../shared/http/origin.js';
import type { ActorContext, AuthContext } from '../../shared/types/actor-context.js';
import { tokenMissingError } from './auth.errors.js';
import type {
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  SessionParams,
  SwitchOrganizationBody,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import type { RequestMetadata } from './auth.types.js';

const MAX_USER_AGENT_LENGTH = 1000;

export interface RefreshCookieSettings {
  secure: boolean;
  domain?: string;
}

export interface AuthControllerOptions {
  service: AuthService;
  allowedOrigins: readonly string[];
  cookie: RefreshCookieSettings;
}

function requestMetadata(req: Request): RequestMetadata {
  const userAgent = req.get('user-agent');

  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
  };
}

export function readRefreshToken(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireAuth(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw tokenMissingError();
  }

  return req.auth;
}

function requireActor(req: Request): ActorContext {
  if (req.actor === undefined) {
    throw tokenMissingError();
  }

  return req.actor;
}

export class AuthController {
  constructor(private readonly options: AuthControllerOptions) {}

  private setCookie(res: Response, token: string, maxAgeSeconds: number): void {
    setRefreshCookie(res, token, {
      secure: this.options.cookie.secure,
      domain: this.options.cookie.domain,
      maxAgeSeconds,
    });
  }

  private clearCookie(res: Response): void {
    clearRefreshCookie(res, {
      secure: this.options.cookie.secure,
      domain: this.options.cookie.domain,
      maxAgeSeconds: 0,
    });
  }

  readonly login: RequestHandler = async (req, res) => {
    const body = req.body as LoginBody;
    const result = await this.options.service.login({
      email: body.email,
      password: body.password,
      organizationId: body.organizationId,
      ...requestMetadata(req),
    });

    this.setCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);
    res.status(200).json(singleResponse(result.body));
  };

  readonly refresh: RequestHandler = async (req, res) => {
    const token = readRefreshToken(req);

    if (token === undefined) {
      throw tokenMissingError();
    }

    const result = await this.options.service.refresh(token, requestMetadata(req));

    this.setCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);
    res.status(200).json(singleResponse(result.body));
  };

  readonly logout: RequestHandler = async (req, res) => {
    if (req.auth === undefined) {
      assertAllowedOrigin(req, this.options.allowedOrigins);
    }

    await this.options.service.logout(req.auth, readRefreshToken(req), requestMetadata(req));

    this.clearCookie(res);
    res.status(204).send();
  };

  readonly logoutAll: RequestHandler = async (req, res) => {
    await this.options.service.logoutAll(requireAuth(req), requestMetadata(req));
    this.clearCookie(res);
    res.status(204).send();
  };

  readonly me: RequestHandler = async (req, res) => {
    const body = await this.options.service.me(requireActor(req));
    res.status(200).json(singleResponse(body));
  };

  readonly sessions: RequestHandler = async (req, res) => {
    const sessions = await this.options.service.listSessions(requireActor(req));
    res.status(200).json(collectionResponse(sessions));
  };

  readonly revokeSession: RequestHandler = async (req, res) => {
    const { sessionId } = req.params as SessionParams;
    const actor = requireActor(req);

    await this.options.service.revokeSession(actor, sessionId, requestMetadata(req));

    if (sessionId === actor.sessionId) {
      this.clearCookie(res);
    }

    res.status(204).send();
  };

  readonly switchOrganization: RequestHandler = async (req, res) => {
    const body = req.body as SwitchOrganizationBody;
    const result = await this.options.service.switchOrganization(
      requireActor(req),
      body.organizationId,
      requestMetadata(req),
    );

    this.setCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);
    res.status(200).json(singleResponse(result.body));
  };

  readonly forgotPassword: RequestHandler = async (req, res) => {
    const body = req.body as ForgotPasswordBody;
    await this.options.service.forgotPassword(body.email, requestMetadata(req));
    res.status(204).send();
  };

  readonly resetPassword: RequestHandler = async (req, res) => {
    const body = req.body as ResetPasswordBody;
    await this.options.service.resetPassword(body.token, body.newPassword, requestMetadata(req));

    this.clearCookie(res);
    res.status(204).send();
  };
}
