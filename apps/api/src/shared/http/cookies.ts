import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'ep_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface RefreshCookieConfig {
  secure: boolean;
  domain?: string;
  maxAgeSeconds: number;
}

function baseOptions(config: RefreshCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(config.domain === undefined ? {} : { domain: config.domain }),
  };
}

export function setRefreshCookie(res: Response, token: string, config: RefreshCookieConfig): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(config),
    maxAge: Math.max(1, Math.floor(config.maxAgeSeconds)) * 1000,
  });
}

export function clearRefreshCookie(res: Response, config: RefreshCookieConfig): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(config));
}
