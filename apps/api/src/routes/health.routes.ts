import express, { type Router } from 'express';

export function createHealthRouter(): Router {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return router;
}
