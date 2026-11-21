import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { env } from './config/env.js';
import { AppError } from './errors/app-error.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

const JSON_BODY_LIMIT = '100kb';
const ROUTE_NOT_FOUND_CODE = 'ROUTE_NOT_FOUND';
const ROUTE_NOT_FOUND_MESSAGE = 'Route not found';
const ROUTE_NOT_FOUND_DETAIL = 'The requested resource was not found.';

const NON_PRODUCTION_CORS_ORIGINS = ['http://localhost:5173'];
const CORS_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id'];
const CORS_MAX_AGE_SECONDS = 600;

const NON_PRODUCTION_CORS_OPTIONS = {
  origin: NON_PRODUCTION_CORS_ORIGINS,
  methods: CORS_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  credentials: false,
  maxAge: CORS_MAX_AGE_SECONDS,
};

const PRODUCTION_CORS_OPTIONS = {
  origin: false,
  methods: [],
  allowedHeaders: [],
  credentials: false,
};

export interface CreateAppOptions {
  logger?: Logger;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors(env.NODE_ENV === 'production' ? PRODUCTION_CORS_OPTIONS : NON_PRODUCTION_CORS_OPTIONS),
  );
  app.use(requestLogger({ logger: options.logger }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

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
