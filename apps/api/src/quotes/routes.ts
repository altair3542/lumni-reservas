import { Router } from 'express';
import type { QuoteService } from './service.js';
export function createQuoteRouter(service: QuoteService): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    res.json(await service.quote(req.body));
  });
  return router;
}
