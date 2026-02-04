"use client";

import { useMemo, useState } from "react";

export type ChatCitation = {
  driveFileRefId: string;
  driveFileName: string;
  chunkIndex: number;
  score: number;
  snippet: string;
  sourceId: string;
};

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citations: ChatCitation[] | null;
  createdAt: string;
};

type SendMessageResponse = {
  answer?: string;
  citations?: ChatCitation[];
  error?: string;
};

type Props = {
  threadId: string;
  initialMessages: ChatMessage[];
};

export const ChatThread = ({ threadId, initialMessages }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setInput("");

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "USER",
      content: trimmed,
      citations: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const response = await fetch(`/api/chat/thread/${threadId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = (await response.json()) as SendMessageResponse;
      if (!response.ok) {
        setError(data.error ?? "Failed to send message.");
        return;
      }
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "ASSISTANT",
        content: data.answer ?? "",
        citations: data.citations ?? [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div>
        {orderedMessages.length === 0 ? (
          <p>No messages yet.</p>
        ) : (
          <ul>
            {orderedMessages.map((message) => (
              <li key={message.id}>
                <strong>{message.role.toLowerCase()}</strong>
                <p>{message.content}</p>
                {message.role === "ASSISTANT" && message.citations?.length ? (
                  <div>
                    <p>
                      <strong>Citations</strong>
                    </p>
                    <ul>
                      {message.citations.map((citation) => (
                        <li key={citation.sourceId}>
                          {citation.driveFileName} (chunk {citation.chunkIndex})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <label htmlFor="chat-input">Message</label>
        <textarea
          id="chat-input"
          rows={4}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{ width: "100%" }}
        />
        <button type="button" onClick={sendMessage} disabled={loading}>
          {loading ? "Sending…" : "Send"}
        </button>
        {error ? <p>{error}</p> : null}
      </div>
    </section>
  );
};
