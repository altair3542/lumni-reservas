import { Router } from 'express';
import { bookingListQuerySchema, uuidSchema } from '@lumni/shared';
import type { BookingService } from './service.js';

export function createBookingRouter(service: BookingService): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    res.status(200).json({ booking: await service.create(req.user!.id, req.body) });
  });
  router.get('/', async (req, res) => {
    const query = bookingListQuerySchema.parse(req.query);
    res.json({ items: await service.list(req.user!.id, query.status) });
  });
  router.get('/:id', async (req, res) => {
    res.json({ booking: await service.get(req.user!.id, uuidSchema.parse(req.params.id)) });
  });
  router.patch('/:id/draft', async (req, res) => {
    res.json({
      booking: await service.save(req.user!.id, uuidSchema.parse(req.params.id), req.body),
    });
  });
  router.post('/:id/confirm', async (req, res) => {
    res.json({
      booking: await service.confirm(req.user!.id, uuidSchema.parse(req.params.id), req.body),
    });
  });
  return router;
}
