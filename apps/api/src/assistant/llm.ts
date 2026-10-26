import { readFileSync } from 'node:fs';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { assistantExtractionSchema, type AssistantSlots } from '@lumni/shared';
import { HttpError } from '../http/errors.js';

export type RoomChoice = { id: string; name: string; size: string; capacity: number };
export type ExtractionRequest = {
  content: string;
  slots: AssistantSlots;
  history: { role: 'user' | 'assistant'; content: string }[];
  rooms: RoomChoice[];
};
export interface LlmClient {
  extract(input: ExtractionRequest): Promise<unknown>;
}
export const unavailable = () =>
  new HttpError(
    503,
    'AI_UNAVAILABLE',
    'El asistente no está disponible ahora. Conservamos tu conversación; puedes reintentar o reservar desde el formulario.',
  );

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const key = env.AI_API_KEY;
  const model = env.AI_MODEL;
  if (!key || !model || !/^gemini-[a-z0-9.-]+$/.test(model))
    return {
      extract: async () => {
        throw unavailable();
      },
    };
  return new GeminiClient(key, model);
}
export class GeminiClient implements LlmClient {
  private readonly client: GoogleGenAI;
  // La misma ruta funciona desde src/ y dist/; el prompt se incluye en la imagen.
  private readonly prompt = readFileSync(
    new URL('../prompts/booking-assistant.md', import.meta.url),
    'utf8',
  );
  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 12000, retryOptions: { attempts: 1 } },
    });
  }
  async extract(input: ExtractionRequest): Promise<unknown> {
    try {
      // Sin tarifas, IDs de usuario, contacto, cookie, secretos ni herramientas.
      const slots = { ...input.slots };
      delete slots.draftVersion;
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  currentMessage: input.content,
                  previousSlots: slots,
                  context: input.history.slice(-6),
                  rooms: input.rooms,
                  services: [
                    { code: 'projector', name: 'Proyector' },
                    { code: 'coffee', name: 'Café' },
                  ],
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: this.prompt,
          temperature: 0,
          ...(this.model.startsWith('gemini-3')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(assistantExtractionSchema),
          abortSignal: AbortSignal.timeout(12000),
        },
      });
      const text = result.text;
      if (!text || text.length > 16000) throw unavailable();
      return JSON.parse(text) as unknown;
    } catch {
      throw unavailable();
    }
  }
}
