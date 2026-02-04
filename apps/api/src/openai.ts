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

  return {
    runChat: async ({ model, maxTokens, messages }) => {
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
        })
      });

      if (!response.ok) {
        throw new Error("openai_request_failed");
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
    }
  };
};
