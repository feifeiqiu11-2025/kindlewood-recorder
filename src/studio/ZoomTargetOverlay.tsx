/* eslint-disable react-hooks/refs -- all ref access here is inside pointer event handlers, not render */
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { contentFracs } from "./stageGeometry";
import "./ZoomTargetOverlay.css";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const MIN_SCALE = 1;
const MAX_SCALE = 3;

type DragState = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  fx: number;
  fy: number;
  sc: number;
  cw: number; // content px width
  ch: number; // content px height
};

/**
 * Draggable / resizable target rectangle shown over the paused preview while a
 * zoom block is selected. Move it to aim the zoom; resize to set the strength
 * (smaller box = stronger zoom). Keeps the focus point fixed while resizing.
 */
export function ZoomTargetOverlay({
  focusX,
  focusY,
  scale,
  videoAspect,
  stageAspect,
  onChange,
}: {
  focusX: number;
  focusY: number;
  scale: number;
  videoAspect: number;
  stageAspect: number;
  onChange: (patch: { focusX?: number; focusY?: number; scale?: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const { wf, hf } = contentFracs(videoAspect, stageAspect);
  const leftF = (1 - wf) / 2;
  const topF = (1 - hf) / 2;

  const wNorm = 1 / scale;
  const boxLeftNorm = clamp(focusX - wNorm / 2, 0, 1 - wNorm);
  const boxTopNorm = clamp(focusY - wNorm / 2, 0, 1 - wNorm);

  const style = {
    left: `${(leftF + boxLeftNorm * wf) * 100}%`,
    top: `${(topF + boxTopNorm * hf) * 100}%`,
    width: `${wNorm * wf * 100}%`,
    height: `${wNorm * hf * 100}%`,
  };

  const startDrag = (mode: "move" | "resize") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      fx: focusX,
      fy: focusY,
      sc: scale,
      cw: r.width * wf,
      ch: r.height * hf,
    };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      onChange({
        focusX: clamp(d.fx + (e.clientX - d.startX) / d.cw, 0, 1),
        focusY: clamp(d.fy + (e.clientY - d.startY) / d.ch, 0, 1),
      });
    } else {
      // Drag the corner outward to widen the box (weaker zoom), inward to zoom in.
      const newW = clamp(1 / d.sc + (e.clientX - d.startX) / d.cw, 1 / MAX_SCALE, 1 / MIN_SCALE);
      onChange({ scale: clamp(1 / newW, MIN_SCALE, MAX_SCALE) });
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      className="ztarget"
      style={style}
      onPointerDown={startDrag("move")}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <span className="ztarget__label">{scale.toFixed(1)}x</span>
      <span className="ztarget__handle" onPointerDown={startDrag("resize")} />
    </div>
  );
}
