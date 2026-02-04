"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ThreadResponse = {
  threadId?: string;
  error?: string;
};

export const CreateThreadButton = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createThread = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/thread", { method: "POST" });
      const data = (await response.json()) as ThreadResponse;
      if (!response.ok || !data.threadId) {
        setError(data.error ?? "Failed to create thread.");
        return;
      }
      router.push(`/chat/${data.threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={createThread} disabled={loading}>
        {loading ? "Creating…" : "New thread"}
      </button>
      {error ? <p>{error}</p> : null}
    </div>
  );
};
