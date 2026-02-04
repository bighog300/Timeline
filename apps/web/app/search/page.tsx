"use client";

import { type FormEvent, useState } from "react";

type SearchResult = {
  score: number;
  driveFileRefId: string;
  driveFileName: string;
  chunkIndex: number;
  snippet: string;
  updatedAt: string;
};

type SearchResponse = {
  results: SearchResult[];
  error?: string;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setMessage("Enter a query to search.");
      setResults([]);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 10 }),
      });
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Search failed.");
        setResults([]);
      } else {
        setResults(data.results ?? []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>Semantic Search</h1>
      <p>
        <a href="/ingest">Back to ingestion</a>
      </p>
      <form onSubmit={runSearch}>
        <input
          type="text"
          name="query"
          placeholder="Search your Drive content"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: "60%" }}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      <section>
        <h2>Results</h2>
        {results.length === 0 ? (
          <p>No matches yet.</p>
        ) : (
          <ul>
            {results.map((result) => (
              <li key={`${result.driveFileRefId}-${result.chunkIndex}`}>
                <strong>{result.driveFileName}</strong> (score:{" "}
                {result.score.toFixed(3)})
                <div>{result.snippet}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
