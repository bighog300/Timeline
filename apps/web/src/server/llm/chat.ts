import { getEnv } from "../../env";
import { ExternalApiError } from "../errors";
import { logTiming } from "../logging";

export type Citation = {
  driveFileRefId: string;
  driveFileName: string;
  chunkIndex: number;
  score: number;
  snippet: string;
  sourceId: string;
};

type ContextChunk = Omit<Citation, "sourceId">;

type ConversationMessage = {
  role: "USER" | "ASSISTANT";
  content: string;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 400;
// Keep context bounded to avoid token overflows.
const MAX_CONTEXT_CHARS = 12000;
const MAX_SNIPPET_CHARS = 1200;
// Trim conversation history to a safe size before sending to the model.
const MAX_CONVERSATION_CHARS = 6000;
const MAX_CONVERSATION_MESSAGES = 12;

const SYSTEM_PROMPT = `You are a helpful assistant answering questions using only the provided context.
- Use only the context; if it is insufficient, say you do not have enough information.
- Do not fabricate facts, files, or quotes.
- Cite sources in brackets using the provided sourceId, e.g. [fileId:3].
- Keep answers concise unless the user asks for detail.`;

const truncate = (value: string, maxChars: number) =>
  value.length > maxChars ? value.slice(0, maxChars - 1).trimEnd() + "…" : value;

// Keep citation sourceIds stable so the UI can match them back to retrieved chunks.
const buildCitations = (chunks: ContextChunk[]): Citation[] =>
  chunks.map((chunk) => ({
    ...chunk,
    snippet: truncate(chunk.snippet, 280),
    sourceId: `${chunk.driveFileRefId}:${chunk.chunkIndex}`,
  }));

const buildContextBlock = (chunks: Citation[]) => {
  let remaining = MAX_CONTEXT_CHARS;
  const sections: string[] = [];

  for (const chunk of chunks) {
    if (remaining <= 0) {
      break;
    }

    const snippet = truncate(chunk.snippet, MAX_SNIPPET_CHARS);
    const header = `Source ${chunk.sourceId} | ${chunk.driveFileName} | chunk ${chunk.chunkIndex} | score ${chunk.score.toFixed(3)}`;
    const body = `${header}\n${snippet}`;
    const block = body.slice(0, remaining);
    sections.push(block);
    remaining -= block.length;
  }

  return sections.join("\n\n");
};

const trimConversation = (conversation: ConversationMessage[]) => {
  const trimmed = conversation.slice(-MAX_CONVERSATION_MESSAGES);
  let remaining = MAX_CONVERSATION_CHARS;
  const output: ConversationMessage[] = [];

  for (const message of trimmed) {
    if (remaining <= 0) {
      break;
    }
    const content = truncate(message.content, remaining);
    output.push({
      role: message.role,
      content,
    });
    remaining -= content.length;
  }

  return output;
};

export const generateAnswer = async (params: {
  query: string;
  contextChunks: ContextChunk[];
  conversation: ConversationMessage[];
  requestContext?: { requestId?: string; userId?: string; route?: string };
}): Promise<{ answer: string; citations: Citation[] }> => {
  const env = getEnv();
  const citations = buildCitations(params.contextChunks);
  const contextBlock = buildContextBlock(citations);
  const trimmedConversation = trimConversation(params.conversation);
  const startTime = Date.now();

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimmedConversation.map((message) => ({
      role: message.role.toLowerCase() as "user" | "assistant",
      content: message.content,
    })),
    {
      role: "user",
      content: `Context:\n${contextBlock || "(no context provided)"}\n\nQuestion:\n${params.query}\n\nAnswer with citations.`,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.CHAT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ExternalApiError(
      `OpenAI chat completion failed (${response.status}): ${message || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  logTiming({
    requestId: params.requestContext?.requestId,
    userId: params.requestContext?.userId,
    route: params.requestContext?.route,
    operation: "llm_chat_completion",
    durationMs: Date.now() - startTime,
  });

  const answer = payload.choices?.[0]?.message?.content?.trim() ?? "";

  return {
    answer: answer || "I don't have enough information to answer that right now.",
    citations,
  };
};
