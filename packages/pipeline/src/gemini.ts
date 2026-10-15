export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: string;
  temperature?: number;
  /** Extra attempts on transient failures (default: 2 total). */
  attempts?: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(err: unknown): boolean {
  return (
    err instanceof Error &&
    /429|500|503|overloaded|timeout|ECONNRESET/i.test(err.message)
  );
}

/**
 * Shared Gemini SDK wrapper used by inference and patching. The API key
 * arrives on the options object (per-request credentials from headers flow
 * through `PipelineConfig`), never read from `process.env` directly.
 */
export async function callGeminiModel(
  opts: GeminiCallOptions,
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const maxAttempts = Math.max(1, opts.attempts ?? 2);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: opts.contents,
        config: {
          systemInstruction: opts.systemInstruction,
          temperature: opts.temperature ?? 0.2,
        },
      });
      const text = response.text;
      if (!text || text.trim() === "") {
        throw new Error("Gemini returned an empty response");
      }
      return text;
    } catch (err) {
      lastError = err;
      const retriable = attempt < maxAttempts && isRetriable(err);
      if (!retriable) break;
      await sleep(4_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
