import type { Quote } from '@lumni/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public suggestedSlot?: Quote['suggestedSlot'],
  ) {
    super(message);
  }
}
