import React from "react";
import { Timeline, TimelineEntry, ZoomControls } from "../components/Timeline";
import { ApiErrorResponseSchema } from "@timeline/shared";
import type { DriveResult, Entry, EntrySourceRef, GmailResult, Prompt, SearchResult } from "@timeline/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

const getErrorCode = (data: unknown) => {
  const parsed = ApiErrorResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.error.code : null;
};

const getErrorMessage = (data: unknown) => {
  const parsed = ApiErrorResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.error.message : null;
};

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
  const [zoom, setZoom] = React.useState<"day" | "week" | "month">("week");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [authStatus, setAuthStatus] = React.useState<"unknown" | "connected" | "disconnected">(
    "unknown"
  );
  const [reconnectRequired, setReconnectRequired] = React.useState(false);
  const [titleInput, setTitleInput] = React.useState("");
  const [startDateInput, setStartDateInput] = React.useState("");
  const [endDateInput, setEndDateInput] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [searchState, setSearchState] = React.useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedSources, setSelectedSources] = React.useState<Record<string, boolean>>({});
  const [entrySources, setEntrySources] = React.useState<EntrySourceRef[]>([]);
  const [prompts, setPrompts] = React.useState<Prompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  const timelineEntries = React.useMemo<TimelineEntry[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        start: new Date(entry.startDate),
        end: new Date(entry.endDate ?? entry.startDate),
        status: entry.status,
        driveWriteStatus: entry.driveWriteStatus
      })),
    [entries]
  );

  const loadEntries = React.useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    const { response, data } = await requestJson("/entries");
    if (response.status === 401) {
      setAuthStatus("disconnected");
      setEntries([]);
    } else if (response.ok) {
      setEntries((data?.entries as Entry[]) ?? []);
      setAuthStatus("connected");
    } else {
      setStatusMessage("Unable to load entries. Please try again.");
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const startOAuth = async () => {
    window.location.href = `${API_BASE}/auth/google/start`;
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
    if (!startDateInput) {
      setStatusMessage("Start date is required.");
      return;
    }
    const { response, data } = await requestJson("/entries", {
      method: "POST",
      body: JSON.stringify({
        title: titleInput.trim() || "Untitled",
        startDate: new Date(startDateInput).toISOString(),
        endDate: endDateInput ? new Date(endDateInput).toISOString() : null,
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      })
    });
    if (response.ok) {
      setEntries((prev) => [data as Entry, ...prev]);
      setTitleInput("");
      setStartDateInput("");
      setEndDateInput("");
      setTagsInput("");
    } else if (response.status === 401) {
      setAuthStatus("disconnected");
    } else if (response.status === 400) {
      setStatusMessage(getErrorMessage(data) ?? "Unable to create entry.");
    } else {
      setStatusMessage("Unable to create entry.");
    }
  };

  const handleRunEntry = async (entryId: string) => {
    setStatusMessage(null);
    const { response, data } = await requestJson(`/entries/${entryId}/run`, {
      method: "POST",
      body: JSON.stringify({ promptId: selectedPromptId })
    });
    if (response.status === 401 && getErrorCode(data) === "reconnect_required") {
      setReconnectRequired(true);
      setStatusMessage("Reconnect required before running summaries.");
      return;
    }
    if (response.ok) {
      const updated = data as Entry;
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setReconnectRequired(false);
    } else {
      setStatusMessage("Unable to run summary.");
    }
  };

  const handleRetryDriveWrite = async (entryId: string) => {
    setStatusMessage(null);
    const { response, data } = await requestJson(`/entries/${entryId}/retry-drive-write`, {
      method: "POST"
    });
    if (response.status === 401 && getErrorCode(data) === "reconnect_required") {
      setReconnectRequired(true);
      setStatusMessage("Reconnect required before retrying Drive write.");
      return;
    }
    if (response.ok) {
      const updated = data as Entry;
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setReconnectRequired(false);
    } else {
      setStatusMessage("Unable to retry Drive write.");
    }
  };

  const handleSearch = async (source: "gmail" | "drive") => {
    setStatusMessage(null);
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("q", searchQuery);
    }
    const { response, data } = await requestJson(`/search/${source}?${params.toString()}`);
    if (response.status === 401) {
      setSearchState(null);
      if (getErrorCode(data) === "reconnect_required") {
        setReconnectRequired(true);
        setStatusMessage("Reconnect required before searching.");
        return;
      }
      setAuthStatus("disconnected");
      return;
    }
    if (response.ok) {
      setSearchState(data as SearchResult);
    } else {
      setStatusMessage("Search failed. Try again.");
    }
  };

  const toggleSourceSelection = (key: string) => {
    setSelectedSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAttachSources = async () => {
    if (!selectedEntry || !searchState) {
      setStatusMessage("Select an entry first.");
      return;
    }
    const sources =
      searchState.source === "gmail"
        ? (searchState.results as GmailResult[])
            .filter((item) => selectedSources[`gmail:${item.messageId}`])
            .map((item) => ({
              sourceType: "gmail",
              sourceId: item.messageId,
              subject: item.subject,
              from: item.from,
              date: item.date,
              internalDate: item.internalDate
            }))
        : (searchState.results as DriveResult[])
            .filter((item) => selectedSources[`drive:${item.fileId}`])
            .map((item) => ({
              sourceType: "drive",
              sourceId: item.fileId,
              name: item.name,
              mimeType: item.mimeType,
              createdTime: item.createdTime,
              modifiedTime: item.modifiedTime,
              size: item.size
            }));
    if (sources.length === 0) {
      setStatusMessage("Select at least one source to attach.");
      return;
    }
    const { response, data } = await requestJson(`/entries/${selectedEntry.id}/sources`, {
      method: "POST",
      body: JSON.stringify({ sources })
    });
    if (response.ok) {
      setEntrySources((prev) => [...prev, ...(data.sources as EntrySourceRef[])]);
      setSelectedSources({});
    } else if (response.status === 400) {
      setStatusMessage(getErrorMessage(data) ?? "Unable to attach sources.");
    } else {
      setStatusMessage("Unable to attach sources.");
    }
  };

  const handleDetachSource = async (sourceId: string) => {
    if (!selectedEntry) {
      return;
    }
    const { response, data } = await requestJson(`/entries/${selectedEntry.id}/sources`, {
      method: "DELETE",
      body: JSON.stringify({ sourceIds: [sourceId] })
    });
    if (response.ok && data?.removed) {
      setEntrySources((prev) => prev.filter((source) => source.id !== sourceId));
    } else if (response.status === 400) {
      setStatusMessage(getErrorMessage(data) ?? "Unable to detach source.");
    } else {
      setStatusMessage("Unable to detach source.");
    }
  };

  const loadEntrySources = React.useCallback(async () => {
    if (!selectedEntry) {
      setEntrySources([]);
      return;
    }
    const { response, data } = await requestJson(`/entries/${selectedEntry.id}/sources`);
    if (response.ok) {
      setEntrySources((data?.sources as EntrySourceRef[]) ?? []);
    }
  }, [selectedEntry]);

  const loadPrompts = React.useCallback(async () => {
    const { response, data } = await requestJson("/prompts");
    if (response.ok) {
      const promptList = (data?.prompts as Prompt[]) ?? [];
      setPrompts(promptList);
      if (!selectedPromptId && promptList.length > 0) {
        setSelectedPromptId(promptList[0].id);
      }
    }
  }, [selectedPromptId]);

  React.useEffect(() => {
    void loadEntrySources();
  }, [loadEntrySources]);

  React.useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

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
            onChange={(event: { target: { value: string } }) => setTitleInput(event.target.value)}
            disabled={authStatus !== "connected"}
          />
          <input
            type="date"
            value={startDateInput}
            onChange={(event: { target: { value: string } }) => setStartDateInput(event.target.value)}
            disabled={authStatus !== "connected"}
          />
          <input
            type="date"
            value={endDateInput}
            onChange={(event: { target: { value: string } }) => setEndDateInput(event.target.value)}
            disabled={authStatus !== "connected"}
          />
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={tagsInput}
            onChange={(event: { target: { value: string } }) => setTagsInput(event.target.value)}
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
        <div className="search-inputs">
          <input
            type="text"
            placeholder="Search query (optional)"
            value={searchQuery}
            onChange={(event: { target: { value: string } }) => setSearchQuery(event.target.value)}
            disabled={authStatus !== "connected"}
          />
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
        {searchState && searchState.results.length > 0 && (
          <div className="search-list">
            {(searchState.results as Array<GmailResult | DriveResult>).map((result) => {
              if (searchState.source === "gmail") {
                const item = result as GmailResult;
                const key = `gmail:${item.messageId}`;
                return (
                  <label key={key} className="search-item">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedSources[key])}
                      onChange={() => toggleSourceSelection(key)}
                    />
                    <div>
                      <div className="search-title">{item.subject ?? "No subject"}</div>
                      <div className="muted">{item.from ?? "Unknown sender"}</div>
                    </div>
                  </label>
                );
              }
              const item = result as DriveResult;
              const key = `drive:${item.fileId}`;
              return (
                <label key={key} className="search-item">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedSources[key])}
                    onChange={() => toggleSourceSelection(key)}
                  />
                  <div>
                    <div className="search-title">{item.name ?? "Untitled file"}</div>
                    <div className="muted">{item.mimeType ?? "Unknown type"}</div>
                  </div>
                </label>
              );
            })}
            <button onClick={handleAttachSources} disabled={!selectedEntry}>
              Attach selected to entry
            </button>
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
              {selectedEntry.driveWriteStatus === "failed" && (
                <button
                  className="secondary"
                  onClick={() => handleRetryDriveWrite(selectedEntry.id)}
                >
                  Retry Drive write
                </button>
              )}
              {selectedEntry.driveFileId && selectedEntry.driveWriteStatus === "ok" && (
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
              <h3>Prompt version</h3>
              <select
                value={selectedPromptId ?? ""}
                onChange={(event: { target: { value: string } }) => setSelectedPromptId(event.target.value)}
                disabled={prompts.length === 0}
              >
                {prompts.length === 0 && <option value="">No prompts available</option>}
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.key} v{prompt.version} • {prompt.model}
                  </option>
                ))}
              </select>
            </div>
            <div className="drawer-section">
              <h3>Summary</h3>
              <p>{selectedEntry.summaryMarkdown ?? "No summary generated yet."}</p>
            </div>
            <div className="drawer-section">
              <h3>Tags</h3>
              {selectedEntry.tags.length > 0 ? (
                <div className="tag-list">
                  {selectedEntry.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No tags yet.</p>
              )}
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
              <h3>Selected sources</h3>
              {entrySources.length > 0 ? (
                <ul className="source-list">
                  {entrySources.map((source) => (
                    <li key={source.id} className="source-item">
                      <div>
                        <strong>{source.sourceType.toUpperCase()}</strong>{" "}
                        {source.sourceType === "gmail"
                          ? source.subject ?? source.sourceId
                          : source.name ?? source.sourceId}
                      </div>
                      <button className="link" onClick={() => handleDetachSource(source.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No sources attached yet.</p>
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
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
        .search-inputs {
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
        .search-list {
          display: grid;
          gap: 10px;
        }
        .search-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }
        .search-title {
          font-weight: 600;
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
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          text-decoration: underline;
        }
        .tag-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tag {
          background: #e2e8f0;
          color: #1e293b;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
        }
        .source-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 8px;
        }
        .source-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
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
