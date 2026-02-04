import { getEnv } from "../../env";
import { ExternalApiError } from "../errors";
import { logTiming } from "../logging";

const DEFAULT_BATCH_SIZE = 100;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchEmbeddings = async (
  input: string[],
  context: { requestId?: string; userId?: string; route?: string } | undefined,
  attempt = 0,
) => {
  const env = getEnv();
  const startTime = Date.now();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.EMBEDDING_MODEL,
      input,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const backoffMs = 500 * Math.pow(2, attempt);
      await sleep(backoffMs);
      return fetchEmbeddings(input, context, attempt + 1);
    }

    throw new ExternalApiError(
      `OpenAI embeddings failed (${response.status}): ${message || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
  };

  logTiming({
    requestId: context?.requestId,
    userId: context?.userId,
    route: context?.route,
    operation: "embedding_batch",
    durationMs: Date.now() - startTime,
    metadata: { batchSize: input.length },
  });

  return payload.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
};

export const embedTexts = async (
  texts: string[],
  context?: { requestId?: string; userId?: string; route?: string },
): Promise<number[][]> => {
  if (texts.length === 0) {
    return [];
  }

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += DEFAULT_BATCH_SIZE) {
    const batch = texts.slice(i, i + DEFAULT_BATCH_SIZE);
    const embeddings = await fetchEmbeddings(batch, context);
    results.push(...embeddings);
  }

  return results;
};
