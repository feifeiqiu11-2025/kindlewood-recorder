import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ZoomBlock } from "../types/project";
import "./Tracks.css";

const LABEL_W = 132;
const MIN_LEN = 0.3;
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

type TracksProps = {
  duration: number;
  pixelsPerSec: number;
  currentTime: number;
  trim: Trim;
  zooms: ZoomBlock[];
  selectedId: string | null;
  hasVideo: boolean;
  onSeek: (t: number) => void;
  onTrim: (t: Trim) => void;
  onSelectZoom: (id: string | null) => void;
  onMoveZoom: (id: string, startSec: number, endSec: number) => void;
};

function tickStep(pps: number): number {
  // Aim for a label roughly every 70px.
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
  trim,
  zooms,
  selectedId,
  hasVideo,
  onSeek,
  onTrim,
  onSelectZoom,
  onMoveZoom,
}: TracksProps) {
  const videoLaneRef = useRef<HTMLDivElement>(null);
  const zoomLaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);

  const px = (t: number) => t * pixelsPerSec;
  const laneWidth = Math.max(duration * pixelsPerSec, 1);

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
      case "trimStart": {
        const t = timeAt(e.clientX, videoLaneRef.current);
        onTrim({ startSec: Math.min(t, trim.endSec - MIN_LEN), endSec: trim.endSec });
        break;
      }
      case "trimEnd": {
        const t = timeAt(e.clientX, videoLaneRef.current);
        onTrim({ startSec: trim.startSec, endSec: Math.max(t, trim.startSec + MIN_LEN) });
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
        style={{ width: LABEL_W + laneWidth }}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
      >
        {/* Ruler */}
        <div className="tracks__row tracks__row--ruler">
          <div className="tracks__label" style={{ width: LABEL_W }} />
          <div className="tracks__lane tracks__ruler" style={{ width: laneWidth }}>
            {ticks.map((t) => (
              <span key={t} className="tracks__tick" style={{ left: px(t) }}>
                {fmt(t)}
              </span>
            ))}
          </div>
        </div>

        {/* VIDEO */}
        <div className="tracks__row">
          <div className="tracks__label" style={{ width: LABEL_W }}>
            <span className="tracks__label-name">VIDEO</span>
            <span className="tracks__label-sub">{hasVideo ? fmt(duration) : "—"}</span>
          </div>
          <div
            ref={videoLaneRef}
            className="tracks__lane"
            style={{ width: laneWidth }}
            onPointerDown={(e) => hasVideo && begin(e, { kind: "seek" })}
          >
            {hasVideo ? (
              <>
                <div className="tracks__clip" style={{ left: px(trim.startSec), width: px(trim.endSec - trim.startSec) }} />
                <div className="tracks__dim" style={{ left: 0, width: px(trim.startSec) }} />
                <div className="tracks__dim" style={{ left: px(trim.endSec), right: 0 }} />
                <div className="tracks__trim" style={{ left: px(trim.startSec) }} onPointerDown={(e) => begin(e, { kind: "trimStart" })} title="Trim start" />
                <div className="tracks__trim" style={{ left: px(trim.endSec) }} onPointerDown={(e) => begin(e, { kind: "trimEnd" })} title="Trim end" />
              </>
            ) : (
              <span className="tracks__empty">Record to add a video clip</span>
            )}
          </div>
        </div>

        {/* ZOOM */}
        <div className="tracks__row">
          <div className="tracks__label" style={{ width: LABEL_W }}>
            <span className="tracks__label-name">ZOOM</span>
            <span className="tracks__label-sub">{zooms.length} block{zooms.length === 1 ? "" : "s"}</span>
          </div>
          <div
            ref={zoomLaneRef}
            className="tracks__lane"
            style={{ width: laneWidth }}
            onPointerDown={() => onSelectZoom(null)}
          >
            {zooms.map((z) => (
              <div
                key={z.id}
                className={`tracks__zoom${z.id === selectedId ? " is-selected" : ""}`}
                style={{ left: px(z.startSec), width: px(z.endSec - z.startSec) }}
                onPointerDown={(e) => {
                  onSelectZoom(z.id);
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
              <span className="tracks__empty">Add a zoom from the Zoom tab</span>
            )}
          </div>
        </div>

        {/* Placeholder audio lanes (the KindleWood audio port lands here). */}
        {[
          { name: "SOUND EFFECTS", hint: "Sound effects — coming from the KindleWood audio port" },
          { name: "MUSIC", hint: "Background music — coming from the KindleWood audio port" },
        ].map((lane) => (
          <div className="tracks__row" key={lane.name}>
            <div className="tracks__label" style={{ width: LABEL_W }}>
              <span className="tracks__label-name">{lane.name}</span>
            </div>
            <div className="tracks__lane tracks__lane--muted" style={{ width: laneWidth }}>
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
