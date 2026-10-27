import { setTimeout } from 'node:timers/promises';
import type { DeliveryResult } from './service.js';
export async function consumeEmails(
  worker: { processOne(): Promise<DeliveryResult> },
  options: {
    signal: AbortSignal;
    batchSize: number;
    pollIntervalMs: number;
    onResult?: (result: Exclude<DeliveryResult, { status: 'idle' }>) => void;
    onCycle?: () => Promise<void>;
    onError?: (error: unknown) => void;
  },
) {
  while (!options.signal.aborted) {
    try {
      for (let i = 0; i < options.batchSize && !options.signal.aborted; i += 1) {
        const result = await worker.processOne();
        if (result.status === 'idle') break;
        options.onResult?.(result);
      }
      if (!options.signal.aborted) await options.onCycle?.();
    } catch (error) {
      options.onError?.(error);
    }
    if (options.signal.aborted) break;
    try {
      await setTimeout(options.pollIntervalMs, undefined, { signal: options.signal });
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}
