import Link from "next/link";

import { getCurrentUser } from "../../../src/server/auth/session";
import { prisma } from "../../../src/server/db/prisma";
import { ChatThread, type ChatCitation } from "./chat-thread";

export default async function ChatThreadPage({
  params,
}: {
  params: { threadId: string };
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <h1>Chat</h1>
        <p>Please sign in to view this thread.</p>
      </main>
    );
  }

  const thread = await prisma.chatThread.findFirst({
    where: {
      id: params.threadId,
      userId: user.id,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  if (!thread) {
    return (
      <main>
        <h1>Chat</h1>
        <p>Thread not found.</p>
      </main>
    );
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 50,
  });

  return (
    <main>
      <h1>{thread.title || "Untitled thread"}</h1>
      <p>
        <Link href="/chat">Back to threads</Link>
      </p>
      <ChatThread
        threadId={thread.id}
        initialMessages={messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citationsJson as ChatCitation[] | null,
          createdAt: message.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
