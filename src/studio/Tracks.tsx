import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Segment, ZoomBlock } from "../types/project";
import "./Tracks.css";

const LABEL_W = 132;
const MIN_LEN = 0.3;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

type DragKind =
  | { kind: "seek" }
  | { kind: "segStart"; id: string }
  | { kind: "segEnd"; id: string }
  | { kind: "zoomMove"; id: string; grabSec: number; lenSec: number }
  | { kind: "zoomStart"; id: string }
  | { kind: "zoomEnd"; id: string };

type TracksProps = {
  duration: number;
  pixelsPerSec: number;
  currentTime: number;
  segments: Segment[];
  zooms: ZoomBlock[];
  selectedId: string | null;
  hasVideo: boolean;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onMoveZoom: (id: string, startSec: number, endSec: number) => void;
  onTrimSegment: (id: string, startSec: number, endSec: number) => void;
};

function tickStep(pps: number): number {
  const target = 70 / pps;
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s >= target) ?? 600;
}

const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function Tracks({
  duration,
  pixelsPerSec,
  currentTime,
  segments,
  zooms,
  selectedId,
  hasVideo,
  onSeek,
  onSelect,
  onMoveZoom,
  onTrimSegment,
}: TracksProps) {
  const videoLaneRef = useRef<HTMLDivElement>(null);
  const zoomLaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);

  const px = (t: number) => t * pixelsPerSec;
  const laneWidth = Math.max(duration * pixelsPerSec, 1);
  const fill = !hasVideo;
  const laneStyle = fill ? { flex: 1, minWidth: 0 } : { width: laneWidth };
  const contentStyle = fill ? { width: "100%" } : { width: LABEL_W + laneWidth };

  const ticks: number[] = [];
  for (let t = 0, step = tickStep(pixelsPerSec); t <= duration + 0.001; t += step) {
    ticks.push(t);
  }

  const timeAt = (clientX: number, el: HTMLElement | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clamp((clientX - rect.left) / pixelsPerSec, 0, duration);
  };

  const begin = (e: ReactPointerEvent, drag: DragKind) => {
    e.stopPropagation();
    dragRef.current = drag;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    switch (drag.kind) {
      case "seek":
        onSeek(timeAt(e.clientX, videoLaneRef.current));
        break;
      case "segStart": {
        const t = timeAt(e.clientX, videoLaneRef.current);
        const s = segments.find((g) => g.id === drag.id);
        if (s) onTrimSegment(drag.id, Math.min(t, s.endSec - MIN_LEN), s.endSec);
        break;
      }
      case "segEnd": {
        const t = timeAt(e.clientX, videoLaneRef.current);
        const s = segments.find((g) => g.id === drag.id);
        if (s) onTrimSegment(drag.id, s.startSec, Math.max(t, s.startSec + MIN_LEN));
        break;
      }
      case "zoomMove": {
        const t = timeAt(e.clientX, zoomLaneRef.current);
        const start = clamp(t - drag.grabSec, 0, duration - drag.lenSec);
        onMoveZoom(drag.id, start, start + drag.lenSec);
        break;
      }
      case "zoomStart": {
        const t = timeAt(e.clientX, zoomLaneRef.current);
        const z = zooms.find((b) => b.id === drag.id);
        if (z) onMoveZoom(drag.id, Math.min(t, z.endSec - MIN_LEN), z.endSec);
        break;
      }
      case "zoomEnd": {
        const t = timeAt(e.clientX, zoomLaneRef.current);
        const z = zooms.find((b) => b.id === drag.id);
        if (z) onMoveZoom(drag.id, z.startSec, Math.max(t, z.startSec + MIN_LEN));
        break;
      }
    }
  };

  const end = () => {
    dragRef.current = null;
  };

  return (
    <div className="tracks">
      <div
        className="tracks__content"
        style={contentStyle}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
      >
        {/* Ruler */}
        <div className="tracks__row tracks__row--ruler">
          <div className="tracks__label" style={{ width: LABEL_W }} />
          <div className="tracks__lane tracks__ruler" style={laneStyle}>
            {ticks.map((t) => (
              <span key={t} className="tracks__tick" style={{ left: px(t) }}>
                {fmt(t)}
              </span>
            ))}
          </div>
        </div>

        {/* VIDEO — kept segments as clips */}
        <div className="tracks__row">
          <div className="tracks__label" style={{ width: LABEL_W }}>
            <span className="tracks__label-name">VIDEO</span>
          </div>
          <div
            ref={videoLaneRef}
            className="tracks__lane"
            style={laneStyle}
            onPointerDown={(e) => {
              if (!hasVideo) return;
              onSelect(null);
              begin(e, { kind: "seek" });
            }}
          >
            {hasVideo ? (
              segments.map((s) => (
                <div
                  key={s.id}
                  className={`tracks__clip${s.id === selectedId ? " is-selected" : ""}`}
                  style={{ left: px(s.startSec), width: px(s.endSec - s.startSec) }}
                  onPointerDown={(e) => {
                    onSelect(s.id);
                    onSeek(timeAt(e.clientX, videoLaneRef.current));
                    begin(e, { kind: "seek" });
                  }}
                >
                  <span
                    className="tracks__clip-edge"
                    onPointerDown={(e) => {
                      onSelect(s.id);
                      begin(e, { kind: "segStart", id: s.id });
                    }}
                  />
                  <span
                    className="tracks__clip-edge tracks__clip-edge--r"
                    onPointerDown={(e) => {
                      onSelect(s.id);
                      begin(e, { kind: "segEnd", id: s.id });
                    }}
                  />
                </div>
              ))
            ) : (
              <span className="tracks__empty">Record to add a video clip</span>
            )}
          </div>
        </div>

        {/* EFFECTS (zoom) */}
        <div className="tracks__row">
          <div className="tracks__label" style={{ width: LABEL_W }}>
            <span className="tracks__label-name">EFFECTS</span>
          </div>
          <div
            ref={zoomLaneRef}
            className="tracks__lane"
            style={laneStyle}
            onPointerDown={() => onSelect(null)}
          >
            {zooms.map((z) => (
              <div
                key={z.id}
                className={`tracks__zoom${z.id === selectedId ? " is-selected" : ""}`}
                style={{ left: px(z.startSec), width: px(z.endSec - z.startSec) }}
                onPointerDown={(e) => {
                  onSelect(z.id);
                  begin(e, {
                    kind: "zoomMove",
                    id: z.id,
                    grabSec: timeAt(e.clientX, zoomLaneRef.current) - z.startSec,
                    lenSec: z.endSec - z.startSec,
                  });
                }}
              >
                <span className="tracks__zoom-edge" onPointerDown={(e) => begin(e, { kind: "zoomStart", id: z.id })} />
                <span className="tracks__zoom-label">{z.scale.toFixed(1)}x</span>
                <span className="tracks__zoom-edge" onPointerDown={(e) => begin(e, { kind: "zoomEnd", id: z.id })} />
              </div>
            ))}
            {zooms.length === 0 && hasVideo && (
              <span className="tracks__empty">Add an effect from the Effects tab</span>
            )}
          </div>
        </div>

        {/* Placeholder audio lanes (the KindleWood audio port lands here). */}
        {[
          { name: "SOUND EFFECTS", hint: "Coming soon" },
          { name: "MUSIC", hint: "Coming soon" },
        ].map((lane) => (
          <div className="tracks__row" key={lane.name}>
            <div className="tracks__label" style={{ width: LABEL_W }}>
              <span className="tracks__label-name">{lane.name}</span>
            </div>
            <div className="tracks__lane tracks__lane--muted" style={laneStyle}>
              <span className="tracks__empty">{lane.hint}</span>
            </div>
          </div>
        ))}

        {hasVideo && (
          <div className="tracks__playhead" style={{ left: LABEL_W + px(currentTime) }} />
        )}
      </div>
    </div>
  );
}
