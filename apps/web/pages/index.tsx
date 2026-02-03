import React, { useState } from "react";
import { Timeline, ZoomControls } from "../components/Timeline";

type Entry = {
  id: string;
  title: string;
  start: string;
  end: string;
};

const demoEntries: Entry[] = [
  { id: "1", title: "Launch Planning", start: "2024-01-01", end: "2024-01-07" },
  { id: "2", title: "Review Materials", start: "2024-01-08", end: "2024-01-10" }
];

export default function HomePage() {
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const [selected, setSelected] = useState<Entry | null>(null);

  return (
    <div className="page">
      <header>
        <h1>Timeline App</h1>
        <p>Summaries are generated only on explicit user action.</p>
      </header>
      <ZoomControls zoom={zoom} onChange={setZoom} />
      <Timeline entries={demoEntries} zoom={zoom} onSelect={setSelected} />
      {selected && (
        <aside className="drawer">
          <div className="drawer-header">
            <h2>{selected.title}</h2>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="drawer-body">
            <p>Derived summary content will appear here.</p>
            <ul>
              <li>Status: ready</li>
              <li>Drive link: (placeholder)</li>
            </ul>
          </div>
        </aside>
      )}
      <style jsx>{`
        .page {
          font-family: "Inter", system-ui, sans-serif;
          padding: 24px;
          display: grid;
          gap: 16px;
        }
        header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .drawer {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          background: #f8fafc;
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .drawer-body {
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
}

