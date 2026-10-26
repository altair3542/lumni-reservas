import { Router } from 'express';
import { uuidSchema, conversationListSchema } from '@lumni/shared';
import type { AssistantService } from './service.js';
export function createAssistantRouter(service: AssistantService): Router {
  const router = Router();
  router.post('/conversations', async (req, res) =>
    res.json({ conversation: await service.create(req.user!.id, req.body) }),
  );
  router.get('/conversations', async (req, res) =>
    res.json(conversationListSchema.parse({ items: await service.list(req.user!.id) })),
  );
  router.get('/conversations/:id', async (req, res) =>
    res.json({ conversation: await service.get(req.user!.id, uuidSchema.parse(req.params.id)) }),
  );
  router.post('/conversations/:id/messages', async (req, res) => {
    const started = performance.now();
    try {
      const conversation = await service.message(
        req.user!.id,
        uuidSchema.parse(req.params.id),
        req.body,
      );
      console.info('CHAT', req.requestId, Math.round(performance.now() - started), 'ok');
      res.json({ conversation });
    } catch (error) {
      console.info('CHAT', req.requestId, Math.round(performance.now() - started), 'error');
      throw error;
    }
  });
  return router;
}
