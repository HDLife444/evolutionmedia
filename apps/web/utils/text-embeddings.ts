export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export type TextChunk = { modality: "lyrics" | "development" | "description"; chunk_index: number; chunk_text: string };

// Never include private provenance, account information, or uploaded audio.
export function songTextChunks(submission: Record<string, unknown>): TextChunk[] {
  const text = (name: string) => typeof submission[name] === "string" ? submission[name] as string : "";
  const sources: [TextChunk["modality"], string][] = [
    ["lyrics", text("lyrics")],
    ["development", `Goal: ${text("development_goal")}\nEmotional progression: ${text("emotional_progression")}`],
    ["description", `Title: ${text("title")}\n${text("description")}`],
  ];
  return sources.flatMap(([modality, source]) => {
    const characters = Array.from(source.trim());
    const chunks: TextChunk[] = [];
    // 1000 Unicode code points fits the database's 4000-character limit and
    // conservatively bounds tokens, including scripts with multi-byte characters.
    for (let offset = 0; offset < characters.length; offset += 1000) {
      chunks.push({ modality, chunk_index: chunks.length, chunk_text: characters.slice(offset, offset + 1000).join("") });
    }
    return chunks;
  });
}

export class EmbeddingProviderError extends Error {
  constructor(readonly status: number, readonly quotaExhausted = false, readonly reason: "quota" | "tokens" | "requests" | "rate_limit" | "other" = "other") {
    super(`Embedding provider returned HTTP ${status}.`);
    this.name = "EmbeddingProviderError";
  }
}

export async function embedTexts(texts: string[], key: string, fetcher: typeof fetch = fetch): Promise<number[][]> {
  const response = await fetcher("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: texts }),
    signal: AbortSignal.timeout(45000),
  });
  // Do not log provider response bodies, input lyrics, or credentials.
  if (!response.ok) {
    // Retain only a known billing classification, never the provider's body,
    // echoed input, account details, or full error message.
    let quotaExhausted = false;
    let reason: EmbeddingProviderError["reason"] = "other";
    if (response.status === 429) {
      const body = await response.json().catch(() => null) as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null;
      const code = body?.error?.code;
      const type = body?.error?.type;
      const message = typeof body?.error?.message === "string" ? body.error.message : "";
      quotaExhausted = code === "insufficient_quota" || type === "insufficient_quota"
        || /exceeded your current quota|billing|credit balance/i.test(message);
      reason = quotaExhausted ? "quota" : type === "tokens" ? "tokens" : type === "requests" ? "requests"
        : code === "rate_limit_exceeded" || /rate limit/i.test(message) ? "rate_limit" : "other";
    }
    throw new EmbeddingProviderError(response.status, quotaExhausted, reason);
  }
  const body = await response.json() as { model?: string; data?: { index: number; embedding: number[] }[] };
  if (body.model !== EMBEDDING_MODEL || !Array.isArray(body.data) || body.data.length !== texts.length) {
    throw new Error("Embedding provider returned an unexpected model or result count.");
  }
  const ordered = [...body.data].sort((a, b) => a.index - b.index);
  if (ordered.some((row, index) => row.index !== index || !Array.isArray(row.embedding)
    || row.embedding.length !== EMBEDDING_DIMENSIONS || row.embedding.some(x => typeof x !== "number" || !Number.isFinite(x))
    || row.embedding.every(x => x === 0))) throw new Error("Embedding provider returned an invalid vector.");
  return ordered.map(row => row.embedding);
}
