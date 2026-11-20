import dotenv from 'dotenv';
import { parseEnv } from './env.schema.js';

dotenv.config({
  path: new URL('../../../../.env', import.meta.url),
  quiet: true,
});

export const env = parseEnv(process.env);

export type { Env } from './env.schema.js';
