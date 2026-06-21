import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ZoomBlock } from "../types/project";
import "./Timeline.css";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

type Trim = { startSec: number; endSec: number };

type DragKind =
  | { kind: "seek" }
  | { kind: "trimStart" }
  | { kind: "trimEnd" }
  | { kind: "zoomMove"; id: string; grabSec: number; lenSec: number }
  | { kind: "zoomStart"; id: string }
  | { kind: "zoomEnd"; id: string };

type TimelineProps = {
  duration: number;
  currentTime: number;
  trim: Trim;
  zooms: ZoomBlock[];
  selectedId: string | null;
  onSeek: (t: number) => void;
  onTrim: (trim: Trim) => void;
  onSelect: (id: string | null) => void;
  onMoveZoom: (id: string, startSec: number, endSec: number) => void;
};

const MIN_ZOOM_LEN = 0.3;

function buildTicks(duration: number): number[] {
  if (duration <= 0) return [];
  // Aim for ~8 labels; snap step to a friendly value.
  const raw = duration / 8;
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find((s) => s >= raw) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);
  return ticks;
}

function fmt(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Timeline({
  duration,
  currentTime,
  trim,
  zooms,
  selectedId,
  onSeek,
  onTrim,
  onSelect,
  onMoveZoom,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);

  const pct = (t: number) => `${(t / Math.max(0.001, duration)) * 100}%`;

  const timeAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const beginDrag = (e: ReactPointerEvent, drag: DragKind) => {
    e.stopPropagation();
    dragRef.current = drag;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeAt(e.clientX);

    switch (drag.kind) {
      case "seek":
        onSeek(t);
        break;
      case "trimStart":
        onTrim({ startSec: Math.min(t, trim.endSec - MIN_ZOOM_LEN), endSec: trim.endSec });
        break;
      case "trimEnd":
        onTrim({ startSec: trim.startSec, endSec: Math.max(t, trim.startSec + MIN_ZOOM_LEN) });
        break;
      case "zoomMove": {
        const start = clamp(t - drag.grabSec, 0, duration - drag.lenSec);
        onMoveZoom(drag.id, start, start + drag.lenSec);
        break;
      }
      case "zoomStart": {
        const z = zooms.find((b) => b.id === drag.id);
        if (z) onMoveZoom(drag.id, Math.min(t, z.endSec - MIN_ZOOM_LEN), z.endSec);
        break;
      }
      case "zoomEnd": {
        const z = zooms.find((b) => b.id === drag.id);
        if (z) onMoveZoom(drag.id, z.startSec, Math.max(t, z.startSec + MIN_ZOOM_LEN));
        break;
      }
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="timeline">
      <div
        ref={trackRef}
        className="timeline__track"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerDown={(e) => beginDrag(e, { kind: "seek" })}
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onSeek(clamp(currentTime - 1, 0, duration));
          if (e.key === "ArrowRight") onSeek(clamp(currentTime + 1, 0, duration));
        }}
      >
        {/* Ruler */}
        <div className="timeline__ruler">
          {buildTicks(duration).map((t) => (
            <span key={t} className="timeline__tick" style={{ left: pct(t) }}>
              {fmt(t)}
            </span>
          ))}
        </div>

        {/* Dimmed regions outside the trim window */}
        <div className="timeline__trimmed" style={{ left: 0, width: pct(trim.startSec) }} />
        <div
          className="timeline__trimmed"
          style={{ left: pct(trim.endSec), right: 0 }}
        />

        {/* Trim handles */}
        <div
          className="timeline__handle"
          style={{ left: pct(trim.startSec) }}
          onPointerDown={(e) => beginDrag(e, { kind: "trimStart" })}
          title="Trim start"
        />
        <div
          className="timeline__handle"
          style={{ left: pct(trim.endSec) }}
          onPointerDown={(e) => beginDrag(e, { kind: "trimEnd" })}
          title="Trim end"
        />

        {/* Zoom blocks */}
        {zooms.map((z) => {
          const selected = z.id === selectedId;
          return (
            <div
              key={z.id}
              className={`timeline__zoom${selected ? " is-selected" : ""}`}
              style={{ left: pct(z.startSec), width: pct(z.endSec - z.startSec) }}
              onPointerDown={(e) => {
                onSelect(z.id);
                beginDrag(e, {
                  kind: "zoomMove",
                  id: z.id,
                  grabSec: timeAt(e.clientX) - z.startSec,
                  lenSec: z.endSec - z.startSec,
                });
              }}
              title={`Zoom ${z.scale.toFixed(1)}x`}
            >
              <span
                className="timeline__zoom-edge timeline__zoom-edge--l"
                onPointerDown={(e) => beginDrag(e, { kind: "zoomStart", id: z.id })}
              />
              <span className="timeline__zoom-label">{z.scale.toFixed(1)}x</span>
              <span
                className="timeline__zoom-edge timeline__zoom-edge--r"
                onPointerDown={(e) => beginDrag(e, { kind: "zoomEnd", id: z.id })}
              />
            </div>
          );
        })}

        {/* Playhead */}
        <div className="timeline__playhead" style={{ left: pct(currentTime) }} />
      </div>
    </div>
  );
}
