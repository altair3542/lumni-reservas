import type { User } from '@lumni/shared';
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: User;
    }
  }
}
