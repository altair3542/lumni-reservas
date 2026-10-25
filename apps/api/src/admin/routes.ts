import { Router } from 'express';
import { uuidSchema } from '@lumni/shared';
import type { AdminService } from './service.js';

export function createAdminRouter(service: AdminService): Router {
  const router = Router();
  router.get('/bookings', async (req, res) => res.json(await service.listBookings(req.query)));
  router.get('/bookings/:id', async (req, res) =>
    res.json(await service.bookingDetail(uuidSchema.parse(req.params.id))),
  );
  router.post('/bookings/:id/cancel', async (req, res) =>
    res.json({
      booking: await service.changeStatus(uuidSchema.parse(req.params.id), 'cancel', req.body),
    }),
  );
  router.post('/bookings/:id/complete', async (req, res) =>
    res.json({
      booking: await service.changeStatus(uuidSchema.parse(req.params.id), 'complete', req.body),
    }),
  );
  router.get('/emails', async (req, res) => res.json(await service.listEmails(req.query)));
  router.get('/emails/:id', async (req, res) =>
    res.json(await service.emailDetail(uuidSchema.parse(req.params.id))),
  );
  return router;
}
