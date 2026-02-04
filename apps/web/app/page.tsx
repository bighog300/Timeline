import { EntryStatus } from "@timeline/shared";

const sharedStatus = EntryStatus.options[0];

export default function HomePage() {
  return (
    <main>
      <h1>Timeline app running</h1>
      <p>Shared status: {sharedStatus}</p>
    </main>
  );
}
