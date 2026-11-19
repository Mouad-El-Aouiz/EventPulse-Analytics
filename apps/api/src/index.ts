import { version } from 'node:process';

export const SERVICE_NAME = 'EventPulse Analytics API';

export function getRuntimeInfo(): { service: string; nodeVersion: string } {
  return {
    service: SERVICE_NAME,
    nodeVersion: version,
  };
}
