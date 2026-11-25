import { createHmac } from 'node:crypto';

export function hashTokenWithPepper(token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(token).digest('base64url');
}
