import { EntryStatus } from "@timeline/shared";

import { getCurrentUser } from "../src/server/auth/session";

const sharedStatus = EntryStatus.options[0];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Timeline app running</h1>
      <p>Shared status: {sharedStatus}</p>
      {user ? (
        <div>
          <p>Signed in as {user.email}</p>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      ) : (
        <a href="/api/auth/google/start">Sign in with Google</a>
      )}
    </main>
  );
}
