import express, { type Express, type Router } from 'express';
import { createHealthRouter } from './health.routes.js';
import { createV1Router } from './v1/index.js';

export const HEALTH_PATH = '/health';
export const API_PATH = '/api';
export const API_VERSION_PATH = '/v1';
export const API_V1_PREFIX = `${API_PATH}${API_VERSION_PATH}`;

export function createApiRouter(): Router {
  const router = express.Router();

  router.use(API_VERSION_PATH, createV1Router());

  return router;
}

export function registerRoutes(app: Express): void {
  app.use(HEALTH_PATH, createHealthRouter());
  app.use(API_PATH, createApiRouter());
}
