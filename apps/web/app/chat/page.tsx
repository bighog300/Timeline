import Link from "next/link";

import { getCurrentUser } from "../../src/server/auth/session";
import { prisma } from "../../src/server/db/prisma";
import { CreateThreadButton } from "./create-thread-button";

export default async function ChatIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <h1>Chat</h1>
        <p>Please sign in to view your chat threads.</p>
      </main>
    );
  }

  const threads = await prisma.chatThread.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  });

  return (
    <main>
      <h1>Chat</h1>
      <p>
        <Link href="/ingest">Back to ingestion</Link>
      </p>
      <CreateThreadButton />
      <section>
        <h2>Your threads</h2>
        {threads.length === 0 ? (
          <p>No threads yet.</p>
        ) : (
          <ul>
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link href={`/chat/${thread.id}`}>
                  {thread.title || "Untitled thread"}
                </Link>
                <div>
                  <small>
                    Updated {thread.updatedAt.toLocaleString()}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
