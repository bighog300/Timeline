"use client";

import { useEffect, useState } from "react";

import { getCsrfToken } from "../../src/client/csrf";

type DriveFileRef = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  sizeBytes: number | null;
  status: string;
  lastError: string | null;
  contentStatus: string;
  contentLastError: string | null;
  ingestedAt: string | null;
  contentVersion: string | null;
};

type ArtifactSummary = {
  id: string;
  type: string;
  updatedAt: string;
  contentHash: string;
};

type FilesResponse = {
  files: DriveFileRef[];
  total: number;
  limit: number;
  offset: number;
  statusCounts: Record<string, number>;
  contentStatusCounts: Record<string, number>;
};

export default function IngestPage() {
  const [files, setFiles] = useState<DriveFileRef[]>([]);
  const [selectedFile, setSelectedFile] = useState<DriveFileRef | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFiles = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/files?limit=50&offset=0");
      const data = (await response.json()) as FilesResponse;
      setFiles(data.files ?? []);
      if (selectedFile) {
        const nextSelected = data.files.find(
          (file) => file.id === selectedFile.id,
        );
        setSelectedFile(nextSelected ?? null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  const loadArtifacts = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/artifacts`);
      const data = (await response.json()) as { artifacts: ArtifactSummary[] };
      setArtifacts(data.artifacts ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load artifacts.",
      );
    }
  };

  const runIndex = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/index/run", {
        method: "POST",
        headers: {
          "x-csrf-token": getCsrfToken() ?? "",
        },
      });
      const data = await response.json();
      setMessage(`Index run: ${JSON.stringify(data)}`);
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Index failed.");
    } finally {
      setLoading(false);
    }
  };

  const runIngest = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ingest/run", {
        method: "POST",
        headers: {
          "x-csrf-token": getCsrfToken() ?? "",
        },
      });
      const data = await response.json();
      setMessage(`Ingest run: ${JSON.stringify(data)}`);
      await loadFiles();
      if (selectedFile) {
        await loadArtifacts(selectedFile.id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ingest failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <h1>Drive Index &amp; Ingest</h1>
      <div>
        <button type="button" onClick={runIndex} disabled={loading}>
          Run Index
        </button>
        <button type="button" onClick={runIngest} disabled={loading}>
          Run Ingest
        </button>
        <button type="button" onClick={loadFiles} disabled={loading}>
          Refresh
        </button>
      </div>
      {message ? <pre>{message}</pre> : null}
      <section>
        <h2>Files</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Mime</th>
              <th>Status</th>
              <th>Content Status</th>
              <th>Modified</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.id}
                onClick={() => {
                  setSelectedFile(file);
                  void loadArtifacts(file.id);
                }}
                style={{
                  cursor: "pointer",
                  background:
                    selectedFile?.id === file.id ? "#eef" : "transparent",
                }}
              >
                <td>{file.name}</td>
                <td>{file.mimeType}</td>
                <td>{file.status}</td>
                <td>{file.contentStatus}</td>
                <td>{file.modifiedTime ?? "-"}</td>
                <td>{file.sizeBytes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Artifacts</h2>
        {selectedFile ? (
          <div>
            <p>Selected: {selectedFile.name}</p>
            <ul>
              {artifacts.map((artifact) => (
                <li key={artifact.id}>
                  {artifact.type} ({artifact.updatedAt})
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>Select a file to view artifacts.</p>
        )}
      </section>
    </main>
  );
}
