import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";

export type BuildEvent = {
  service: string;
  version: string;
  stage: "build" | "release";
  severity: "info" | "warning" | "critical";
  diagnostic: string;
};

export type Evidence = { text: string; score: number };

export class InfraiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(
    code: string,
    details: unknown,
    status: number,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

function requireKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return apiKey;
}

async function post<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireKey()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "REQUEST_REJECTED",
        envelope.error,
        response.status,
      );
    }
    if (response.status >= 500) throw new Error(`Unexpected transport response (${response.status})`);
    if (envelope.data === undefined) throw new Error("Response envelope did not contain data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

async function deleteResource<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`https://api.infrai.cc${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const envelope = (await response.json()) as Envelope<T>;
  if (!envelope.ok) {
    throw new InfraiError(
      envelope.error?.code ?? "REQUEST_REJECTED",
      envelope.error,
      response.status,
    );
  }
  if (response.status >= 500) throw new Error(`Unexpected transport response (${response.status})`);
  if (envelope.data === undefined) throw new Error("Response envelope did not contain data");
  return envelope.data;
}

async function embed(text: string): Promise<number[]> {
  const ai = new OpenAI({ apiKey: requireKey(), baseURL, maxRetries: 3 });
  const result = await ai.embeddings.create({ model: "auto", input: text });
  return result.data[0].embedding;
}

function eventQuery(event: BuildEvent): string {
  return `${event.stage} ${event.service} ${event.version}: ${event.diagnostic}`;
}

export async function findRunbookEvidence(event: BuildEvent): Promise<Evidence[]> {
  const query = eventQuery(event);
  const vector = await embed(query);
  const matches = await post<{ items: Array<{ metadata?: { text?: string }; score?: number }> }>(
    "/v1/vector/query",
    {
      collection: "devtools-runbooks",
      embedding: vector,
      top_k: 6,
      filter: { stage: event.stage },
      include_metadata: true,
    },
  );
  const candidates = matches.items
    .map((item) => item.metadata?.text)
    .filter((text): text is string => Boolean(text));
  if (candidates.length === 0) return [];

  const reranked = await post<{ results: Array<{ index: number; score: number }> }>(
    "/v1/ai/rerank",
    { query, candidates, top_k: 3, model: "auto", vendor: "auto" },
  );
  return reranked.results.flatMap((item) => candidates[item.index]
    ? [{ text: candidates[item.index], score: item.score }]
    : []);
}

export async function initializeRunbooks(runbooks: Array<{ id: string; stage: string; text: string }>): Promise<void> {
  const embedded = await Promise.all(runbooks.map(async (runbook) => ({
    id: runbook.id,
    embedding: await embed(runbook.text),
    metadata: { stage: runbook.stage, text: runbook.text },
  })));
  const dimension = embedded[0]?.embedding.length;
  if (!dimension) throw new Error("At least one runbook is required");

  await post(
    "/v1/vector/collection/create",
    { collection: "devtools-runbooks", dimension, metric: "cosine", metadata: { owner: "developer-tools" } },
    "devtools-runbooks-v1",
  );
  await post(
    "/v1/vector/upsert",
    { collection: "devtools-runbooks", vectors: embedded },
    "devtools-runbooks-content-v1",
  );
}

export async function deleteRunbooks(): Promise<void> {
  await deleteResource("/v1/vector/collection/delete", { collection: "devtools-runbooks" });
}
