import { EntryStatus } from "@timeline/shared";

import { getCurrentUser } from "../src/server/auth/session";
import { LogoutButton } from "./logout-button";

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
          <LogoutButton />
        </div>
      ) : (
        <a href="/api/auth/google/start">Sign in with Google</a>
      )}
    </main>
  );
}
