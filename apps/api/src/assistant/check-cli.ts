// Diagnóstico explícito de una única petición. Nunca imprime la clave ni la respuesta del proveedor.
async function main() {
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!key || !model || !/^gemini-[a-z0-9.-]+$/.test(model)) {
    console.error(
      'Configura AI_API_KEY y AI_MODEL en .env. La clave debe ser de tu proyecto personal de Gemini.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Comprobando Gemini API, modelo ${model}…`);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responde solamente OK.' }] }],
          generationConfig: {
            maxOutputTokens: 512,
            ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
          },
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    const body: unknown = await response.json();
    const candidate =
      body && typeof body === 'object' && 'candidates' in body && Array.isArray(body.candidates)
        ? (body.candidates[0] as
            | { content?: { parts?: { text?: string; thought?: boolean }[] } }
            | undefined)
        : undefined;
    const hasText = candidate?.content?.parts?.some(
      (part) => !part.thought && typeof part.text === 'string' && part.text.trim(),
    );
    if (response.ok && hasText) {
      console.log('Conexión correcta: la API generó texto.');
      return;
    }
    console.error(`La API no generó una respuesta válida. HTTP ${response.status}.`);
    if (response.status === 429)
      console.error(
        'Revisa los límites del proyecto/modelo en AI Studio y vuelve a intentar después.',
      );
    else if (response.status === 503)
      console.error(
        'Servicio no disponible. Reintenta después; Playground y API pueden tener límites diferentes.',
      );
    else if (response.status === 400 || response.status === 403)
      console.error('Revisa la clave, sus restricciones y el acceso del proyecto a Gemini API.');
    else if (response.status === 404)
      console.error('Revisa que AI_MODEL esté disponible para tu proyecto.');
    process.exitCode = 1;
  } catch {
    console.error(
      'No recibimos una respuesta válida en 12 segundos. Comprueba la conexión y vuelve a intentar.',
    );
    process.exitCode = 1;
  }
}
void main();
