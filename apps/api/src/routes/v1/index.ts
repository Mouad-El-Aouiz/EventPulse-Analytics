import express, { type Router } from 'express';

export function createV1Router(): Router {
  const router = express.Router();

  // Register the routers of the business modules here as they are implemented.
  return router;
}
