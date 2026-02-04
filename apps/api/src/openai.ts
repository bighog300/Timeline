export type OpenAIUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type OpenAIChatMessage = {
  role: "system" | "user";
  content: string;
};

export type OpenAIClient = {
  runChat: (input: {
    model: string;
    maxTokens: number;
    messages: OpenAIChatMessage[];
  }) => Promise<{ output: string; usage: OpenAIUsage }>;
};

const createStubClient = (): OpenAIClient => ({
  runChat: async () => ({
    output: JSON.stringify({
      summaryMarkdown: "# Summary\n\nStub summary output.",
      keyPoints: ["Stub key point"]
    }),
    usage: { promptTokens: 0, completionTokens: 0 }
  })
});

export const createOpenAIClient = (): OpenAIClient => {
  if (process.env.OPENAI_STUB === "1" || process.env.NODE_ENV === "test") {
    return createStubClient();
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  const requestTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 30000);
  const maxAttempts = 2;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const buildBackoffMs = (attempt: number) => {
    const base = 500;
    const max = 1500;
    const jitter = Math.random() * base;
    const delay = base * Math.pow(2, attempt - 1) + jitter;
    return Math.min(delay, max);
  };

  const isRetryableStatus = (status: number) => status === 429 || status >= 500;
  const buildRequestError = (retryable: boolean) => {
    const error = new Error("openai_request_failed");
    (error as { retryable?: boolean }).retryable = retryable;
    return error;
  };

  return {
    runChat: async ({ model, maxTokens, messages }) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              messages,
              response_format: { type: "json_object" }
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const retryable = isRetryableStatus(response.status);
            if (retryable && attempt < maxAttempts) {
              await sleep(buildBackoffMs(attempt));
              continue;
            }
            throw buildRequestError(retryable);
          }

          const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string | null } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const output = payload.choices?.[0]?.message?.content ?? "";
          return {
            output,
            usage: {
              promptTokens: payload.usage?.prompt_tokens ?? 0,
              completionTokens: payload.usage?.completion_tokens ?? 0
            }
          };
        } catch (error) {
          const name = (error as { name?: string } | null)?.name;
          if (attempt < maxAttempts && (name === "AbortError" || name === "TypeError")) {
            await sleep(buildBackoffMs(attempt));
            continue;
          }
          const retryable = (error as { retryable?: boolean } | null)?.retryable;
          if (attempt < maxAttempts && retryable) {
            await sleep(buildBackoffMs(attempt));
            continue;
          }
          break;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new Error("openai_request_failed");
    }
  };
};
