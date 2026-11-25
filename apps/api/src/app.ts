import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { env } from './config/env.js';
import { AppError } from './errors/app-error.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { registerRoutes } from './routes/index.js';
import { parseAllowedOrigins } from './shared/http/origin.js';

const JSON_BODY_LIMIT = '100kb';
const ROUTE_NOT_FOUND_CODE = 'ROUTE_NOT_FOUND';
const ROUTE_NOT_FOUND_MESSAGE = 'Route not found';
const ROUTE_NOT_FOUND_DETAIL = 'The requested resource was not found.';

const FALLBACK_DEVELOPMENT_ORIGIN = 'http://localhost:5173';
const CORS_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id'];
const CORS_MAX_AGE_SECONDS = 600;

function resolveAllowedOrigins(): string[] {
  const configured = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (configured.length > 0) {
    return configured;
  }

  return env.NODE_ENV === 'production' ? [] : [FALLBACK_DEVELOPMENT_ORIGIN];
}

const CORS_OPTIONS: CorsOptions = {
  origin: (origin, callback) => {
    // Resolved per request so that runtime environment overrides (tests,
    // multi-tenant deployments) cannot be bypassed by a stale module value.
    callback(null, origin !== undefined && resolveAllowedOrigins().includes(origin));
  },
  methods: CORS_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  credentials: true,
  maxAge: CORS_MAX_AGE_SECONDS,
};

export interface CreateAppOptions {
  logger?: Logger;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY_HOPS ?? 0);
  app.use(helmet());
  app.use(cors(CORS_OPTIONS));
  app.use(requestLogger({ logger: options.logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  registerRoutes(app);

  app.use((_req, _res, next) => {
    next(
      new AppError(ROUTE_NOT_FOUND_MESSAGE, {
        statusCode: 404,
        code: ROUTE_NOT_FOUND_CODE,
        publicDetail: ROUTE_NOT_FOUND_DETAIL,
      }),
    );
  });

  app.use(errorHandler);

  return app;
}
