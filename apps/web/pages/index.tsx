import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Timeline, TimelineEntry, ZoomControls } from "../components/Timeline";

type EntryStatus = "processing" | "ready" | "error";
type DriveWriteStatus = "ok" | "pending" | "failed";

type EntryRecord = {
  id: string;
  title: string;
  status: EntryStatus;
  driveWriteStatus: DriveWriteStatus;
  driveFileId: string | null;
  summaryMarkdown: string | null;
  keyPoints: string[];
  metadataRefs: string[];
  createdAt: string;
  updatedAt: string;
};

type SearchResult = {
  source: "gmail" | "drive";
  metadataOnly: boolean;
  results: unknown[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

const requestJson = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    },
    credentials: "include"
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
};

export default function HomePage() {
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"unknown" | "connected" | "disconnected">(
    "unknown"
  );
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [searchState, setSearchState] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  const timelineEntries = useMemo<TimelineEntry[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        start: new Date(entry.createdAt),
        end: new Date(entry.updatedAt),
        status: entry.status,
        driveWriteStatus: entry.driveWriteStatus
      })),
    [entries]
  );

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    const { response, data } = await requestJson("/entries");
    if (response.status === 401) {
      setAuthStatus("disconnected");
      setEntries([]);
    } else if (response.ok) {
      setEntries((data?.entries as EntryRecord[]) ?? []);
      setAuthStatus("connected");
    } else {
      setStatusMessage("Unable to load entries. Please try again.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const startOAuth = async () => {
    setStatusMessage(null);
    const { response, data } = await requestJson("/auth/google/start");
    if (response.ok && data?.url) {
      window.location.href = data.url as string;
      return;
    }
    setStatusMessage("Unable to start OAuth flow.");
  };

  const handleLogout = async () => {
    await requestJson("/auth/logout", { method: "POST" });
    setAuthStatus("disconnected");
    setEntries([]);
    setSelectedId(null);
  };

  const handleCreateEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    const { response, data } = await requestJson("/entries", {
      method: "POST",
      body: JSON.stringify({ title: titleInput.trim() || "Untitled" })
    });
    if (response.ok) {
      setEntries((prev) => [data as EntryRecord, ...prev]);
      setTitleInput("");
    } else if (response.status === 401) {
      setAuthStatus("disconnected");
    } else {
      setStatusMessage("Unable to create entry.");
    }
  };

  const handleRunEntry = async (entryId: string) => {
    setStatusMessage(null);
    const { response, data } = await requestJson(`/entries/${entryId}/run`, { method: "POST" });
    if (response.status === 401 && data?.error === "reconnect_required") {
      setReconnectRequired(true);
      setStatusMessage("Reconnect required before running summaries.");
      return;
    }
    if (response.ok) {
      const updated = data as EntryRecord;
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setReconnectRequired(false);
    } else {
      setStatusMessage("Unable to run summary.");
    }
  };

  const handleSearch = async (source: "gmail" | "drive") => {
    setStatusMessage(null);
    const { response, data } = await requestJson(`/search/${source}`);
    if (response.status === 401) {
      setAuthStatus("disconnected");
      setSearchState(null);
      return;
    }
    if (response.ok) {
      setSearchState(data as SearchResult);
    } else {
      setStatusMessage("Search failed. Try again.");
    }
  };

  return (
    <div className="page">
      <header>
        <div>
          <h1>Timeline App</h1>
          <p>Summaries are generated only on explicit user action.</p>
        </div>
        <div className="header-actions">
          {authStatus === "connected" ? (
            <>
              <button className="secondary" onClick={loadEntries} disabled={isLoading}>
                Refresh
              </button>
              <button className="secondary" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <button onClick={startOAuth}>Connect Google</button>
          )}
        </div>
      </header>
      {reconnectRequired && (
        <section className="reconnect-banner">
          <div>
            <strong>Reconnect required.</strong> OAuth tokens are missing or expired.
          </div>
          <button onClick={startOAuth}>Reconnect Google</button>
        </section>
      )}
      {statusMessage && <p className="status-message">{statusMessage}</p>}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Timeline</h2>
            <p className="muted">Zoom, scroll, and select entries to view details.</p>
          </div>
          <ZoomControls zoom={zoom} onChange={setZoom} />
        </div>
        <Timeline
          entries={timelineEntries}
          zoom={zoom}
          selectedId={selectedId}
          onSelect={(entry) => setSelectedId(entry.id)}
        />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Create summary entry</h2>
            <p className="muted">Explicit user action triggers summary generation.</p>
          </div>
        </div>
        <form className="entry-form" onSubmit={handleCreateEntry}>
          <input
            type="text"
            placeholder="Entry title"
            value={titleInput}
            onChange={(event) => setTitleInput(event.target.value)}
            disabled={authStatus !== "connected"}
          />
          <button type="submit" disabled={authStatus !== "connected"}>
            Create entry
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Metadata search</h2>
            <p className="muted">Search Gmail or Drive metadata only.</p>
          </div>
        </div>
        <div className="search-actions">
          <button onClick={() => handleSearch("gmail")} disabled={authStatus !== "connected"}>
            Search Gmail metadata
          </button>
          <button onClick={() => handleSearch("drive")} disabled={authStatus !== "connected"}>
            Search Drive metadata
          </button>
        </div>
        {searchState && (
          <div className="search-result">
            <strong>{searchState.source.toUpperCase()}</strong> • metadataOnly:
            {" "}
            {String(searchState.metadataOnly)} • results: {searchState.results.length}
          </div>
        )}
      </section>
      {selectedEntry && (
        <aside className="drawer">
          <div className="drawer-header">
            <div>
              <h2>{selectedEntry.title}</h2>
              <p className="muted">
                Status: {selectedEntry.status} • Drive write: {selectedEntry.driveWriteStatus}
              </p>
            </div>
            <button className="secondary" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-actions">
              <button
                onClick={() => handleRunEntry(selectedEntry.id)}
                disabled={authStatus !== "connected"}
              >
                Run summary
              </button>
              {selectedEntry.driveFileId && (
                <a
                  className="link"
                  href={`https://drive.google.com/open?id=${selectedEntry.driveFileId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Drive file
                </a>
              )}
            </div>
            <div className="drawer-section">
              <h3>Summary</h3>
              <p>{selectedEntry.summaryMarkdown ?? "No summary generated yet."}</p>
            </div>
            <div className="drawer-section">
              <h3>Key points</h3>
              {selectedEntry.keyPoints.length > 0 ? (
                <ul>
                  {selectedEntry.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No key points yet.</p>
              )}
            </div>
            <div className="drawer-section">
              <h3>Metadata references</h3>
              {selectedEntry.metadataRefs.length > 0 ? (
                <ul>
                  {selectedEntry.metadataRefs.map((ref) => (
                    <li key={ref}>{ref}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No metadata references yet.</p>
              )}
            </div>
          </div>
        </aside>
      )}
      <style jsx>{`
        .page {
          font-family: "Inter", system-ui, sans-serif;
          padding: 24px 32px 64px;
          display: grid;
          gap: 20px;
          background: #f8fafc;
          min-height: 100vh;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        header h1 {
          margin: 0;
        }
        .header-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .panel {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          display: grid;
          gap: 12px;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .muted {
          color: #64748b;
          font-size: 14px;
        }
        .status-message {
          color: #b91c1c;
          font-weight: 500;
        }
        .reconnect-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #fca5a5;
          background: #fee2e2;
          color: #7f1d1d;
        }
        .entry-form {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        input {
          flex: 1;
          min-width: 220px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5f5;
        }
        button {
          border: none;
          background: #2563eb;
          color: #fff;
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .secondary {
          background: #fff;
          color: #1d4ed8;
          border: 1px solid #cbd5f5;
        }
        .search-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .search-result {
          background: #eff6ff;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
        }
        .drawer {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          background: #fff;
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
          position: sticky;
          top: 24px;
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .drawer-body {
          margin-top: 16px;
          display: grid;
          gap: 16px;
        }
        .drawer-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .drawer-section h3 {
          margin-bottom: 8px;
        }
        .link {
          color: #1d4ed8;
          font-weight: 600;
        }
        @media (max-width: 900px) {
          .drawer {
            position: static;
          }
        }
      `}</style>
    </div>
  );
}
