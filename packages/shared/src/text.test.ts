import { describe, expect, it } from 'vitest';
import { cancelSchema, chatInputSchema, createDraftSchema, draftStepSchema } from './index.js';

const id = '00000000-0000-4000-8000-000000000101';
describe('Texto que puede persistirse en PostgreSQL', () => {
  it.each(['\0', '\ud800', '\udfff'])(
    'rechaza el carácter inválido %j en los campos libres',
    (text) => {
      for (const customer of [{ fullName: `Ana${text}` }, { company: `Equipo${text}` }])
        expect(createDraftSchema.safeParse({ clientRequestId: id, customer }).success).toBe(false);
      expect(
        draftStepSchema.safeParse({
          step: 1,
          expectedVersion: 1,
          customer: { fullName: `Ana${text}`, email: 'ana@example.com' },
        }).success,
      ).toBe(false);
      expect(cancelSchema.safeParse({ expectedVersion: 1, reason: `Cambio${text}` }).success).toBe(
        false,
      );
      expect(
        chatInputSchema.safeParse({
          kind: 'message',
          clientMessageId: id,
          expectedVersion: 1,
          content: `Sala${text}`,
        }).success,
      ).toBe(false);
    },
  );

  it('conserva Unicode válido, emojis, tabulaciones y saltos de línea del chat', () => {
    const content = 'Reunión con José 👩🏽‍💻\nSala para seis\tcon café';
    expect(
      chatInputSchema.parse({ kind: 'message', clientMessageId: id, expectedVersion: 1, content }),
    ).toMatchObject({ kind: 'message', content });
    expect(
      createDraftSchema.parse({
        clientRequestId: id,
        customer: { fullName: '  José 👨‍👩‍👧  ', company: '团队' },
      }).customer?.fullName,
    ).toBe('José 👨‍👩‍👧');
    expect(cancelSchema.parse({ expectedVersion: 1, reason: 'Cambio 📅' }).reason).toBe(
      'Cambio 📅',
    );
  });
});
