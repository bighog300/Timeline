import React from "react";

export type TimelineEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: "processing" | "ready" | "error";
  driveWriteStatus: "ok" | "pending" | "failed";
};

const zoomLevels = ["day", "week", "month"] as const;

export type ZoomLevel = (typeof zoomLevels)[number];

type TimelineProps = {
  entries: TimelineEntry[];
  zoom: ZoomLevel;
  selectedId?: string | null;
  onSelect: (entry: TimelineEntry) => void;
};

const msPerDay = 1000 * 60 * 60 * 24;

const formatDate = (value: Date) =>
  value.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const getDateRange = (entries: TimelineEntry[]) => {
  const now = new Date();
  if (entries.length === 0) {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  const minStart = entries.reduce(
    (min, entry) => (entry.start < min ? entry.start : min),
    entries[0].start
  );
  const maxEnd = entries.reduce(
    (max, entry) => (entry.end > max ? entry.end : max),
    entries[0].end
  );
  return { start: minStart, end: maxEnd };
};

const getPixelsPerDay = (zoom: ZoomLevel) => {
  if (zoom === "day") {
    return 72;
  }
  if (zoom === "week") {
    return 28;
  }
  return 10;
};

const getTickStep = (zoom: ZoomLevel) => {
  if (zoom === "day") {
    return 1;
  }
  if (zoom === "week") {
    return 7;
  }
  return 30;
};

const getStatusColor = (entry: TimelineEntry) => {
  if (entry.status === "error" || entry.driveWriteStatus === "failed") {
    return "#dc2626";
  }
  if (entry.status === "processing" || entry.driveWriteStatus === "pending") {
    return "#f59e0b";
  }
  return "#2563eb";
};

export const Timeline: React.FC<TimelineProps> = ({ entries, zoom, selectedId, onSelect }) => {
  const { start, end } = getDateRange(entries);
  const pixelsPerDay = getPixelsPerDay(zoom);
  const tickStep = getTickStep(zoom);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay) + 1);
  const width = totalDays * pixelsPerDay + 160;
  const rowHeight = 52;

  const ticks = Array.from({ length: Math.ceil(totalDays / tickStep) }).map((_, index) => {
    const dayOffset = index * tickStep;
    const tickDate = new Date(start);
    tickDate.setDate(tickDate.getDate() + dayOffset);
    return {
      left: dayOffset * pixelsPerDay,
      label: formatDate(tickDate)
    };
  });

  return (
    <div className="timeline-container">
      <div className="timeline-grid" style={{ width }}>
        <div className="timeline-axis">
          {ticks.map((tick) => (
            <div key={tick.label} className="timeline-tick" style={{ left: tick.left }}>
              <span>{tick.label}</span>
            </div>
          ))}
        </div>
        <div className="timeline-rows">
          {entries.map((entry, index) => {
            const startOffset = Math.max(
              0,
              Math.floor((entry.start.getTime() - start.getTime()) / msPerDay)
            );
            const durationDays =
              Math.max(1, Math.ceil((entry.end.getTime() - entry.start.getTime()) / msPerDay) + 1) ||
              1;
            return (
              <button
                key={entry.id}
                className={`timeline-bar ${selectedId === entry.id ? "selected" : ""}`}
                style={{
                  top: `${index * rowHeight}px`,
                  left: `${startOffset * pixelsPerDay}px`,
                  width: `${durationDays * pixelsPerDay}px`,
                  background: getStatusColor(entry)
                }}
                onClick={() => onSelect(entry)}
              >
                <span>{entry.title}</span>
                <span className="meta">{entry.status}</span>
              </button>
            );
          })}
          {entries.length === 0 && (
            <div className="timeline-empty">Create a summary entry to populate the timeline.</div>
          )}
        </div>
      </div>
      <style jsx>{`
        .timeline-container {
          border: 1px solid #e2e8f0;
          height: 360px;
          overflow: auto;
          position: relative;
          background: #fff;
          border-radius: 12px;
        }
        .timeline-grid {
          position: relative;
          min-height: 100%;
          padding: 44px 40px 32px;
        }
        .timeline-axis {
          position: sticky;
          top: 0;
          left: 0;
          height: 24px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(#fff 70%, rgba(255, 255, 255, 0));
          z-index: 1;
        }
        .timeline-tick {
          position: absolute;
          top: 0;
          height: 24px;
          padding-left: 4px;
          border-left: 1px dashed #cbd5f5;
          color: #475569;
          font-size: 12px;
        }
        .timeline-rows {
          position: relative;
          min-height: 200px;
        }
        .timeline-bar {
          position: absolute;
          height: 38px;
          border-radius: 12px;
          color: #fff;
          border: none;
          padding: 6px 12px;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.1);
        }
        .timeline-bar .meta {
          font-size: 12px;
          opacity: 0.85;
          text-transform: capitalize;
        }
        .timeline-bar.selected {
          outline: 2px solid #1d4ed8;
          outline-offset: 2px;
        }
        .timeline-empty {
          padding: 32px;
          color: #64748b;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

export const ZoomControls: React.FC<{
  zoom: ZoomLevel;
  onChange: (zoom: ZoomLevel) => void;
}> = ({ zoom, onChange }) => (
  <div className="zoom-controls">
    {zoomLevels.map((level) => (
      <button
        key={level}
        onClick={() => onChange(level)}
        className={zoom === level ? "active" : ""}
      >
        {level}
      </button>
    ))}
    <style jsx>{`
      .zoom-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      button {
        border: 1px solid #cbd5f5;
        background: #fff;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        text-transform: capitalize;
      }
      .active {
        background: #1d4ed8;
        color: #fff;
      }
    `}</style>
  </div>
);
