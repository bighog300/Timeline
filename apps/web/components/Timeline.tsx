import React from "react";

type Entry = {
  id: string;
  title: string;
  start: string;
  end: string;
};

const zoomLevels = ["day", "week", "month"] as const;

type ZoomLevel = (typeof zoomLevels)[number];

type TimelineProps = {
  entries: Entry[];
  zoom: ZoomLevel;
  onSelect: (entry: Entry) => void;
};

export const Timeline: React.FC<TimelineProps> = ({ entries, zoom, onSelect }) => {
  const scale = zoom === "day" ? 1 : zoom === "week" ? 0.5 : 0.25;
  return (
    <div className="timeline-container">
      <div className="timeline-grid" style={{ transform: `scale(${scale})` }}>
        {entries.map((entry, index) => (
          <button
            key={entry.id}
            className="timeline-bar"
            style={{ top: `${index * 40}px` }}
            onClick={() => onSelect(entry)}
          >
            {entry.title}
          </button>
        ))}
      </div>
      <style jsx>{`
        .timeline-container {
          border: 1px solid #e2e8f0;
          height: 320px;
          overflow: auto;
          position: relative;
          background: #fff;
        }
        .timeline-grid {
          position: relative;
          width: 800px;
          height: 400px;
          transform-origin: top left;
        }
        .timeline-bar {
          position: absolute;
          left: 40px;
          height: 32px;
          width: 240px;
          border-radius: 8px;
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 0 12px;
          text-align: left;
          cursor: pointer;
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
      }
      .active {
        background: #1d4ed8;
        color: #fff;
      }
    `}</style>
  </div>
);

