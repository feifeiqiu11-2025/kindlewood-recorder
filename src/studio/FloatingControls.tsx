import { createPortal } from "react-dom";
import type { CapturePhase } from "../record/useCaptureController";

/**
 * Always-on-top recording controls so the user can pause/stop without
 * split-screening the recorder against the content being recorded.
 *
 * Primary: rendered into a Document Picture-in-Picture window (floats over
 * every app/tab). Fallback when DPiP is unavailable: a fixed in-page bar.
 */

const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const S = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    background: "#16161f",
    color: "#fff",
    borderRadius: "12px",
    font: "600 14px system-ui, sans-serif",
    boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
  } as const,
  dot: (on: boolean) =>
    ({
      width: 11,
      height: 11,
      borderRadius: "50%",
      background: on ? "#ff4d6d" : "#9aa0b4",
      flex: "0 0 auto",
    }) as const,
  time: { fontVariantNumeric: "tabular-nums", minWidth: 52 } as const,
  btn: {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #3a3a4f",
    background: "#26263a",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  stop: {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: "none",
    background: "#e23d5b",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  big: { fontSize: 28, fontWeight: 800, padding: "0 6px" } as const,
  fixed: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2147483647,
  } as const,
};

type Props = {
  target: Window | null;
  phase: CapturePhase;
  countdown: number;
  elapsedSec: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

function Controls({ phase, countdown, elapsedSec, onPause, onResume, onStop }: Props) {
  return (
    <div style={S.wrap}>
      {phase === "countdown" ? (
        <span style={S.big}>{countdown}</span>
      ) : (
        <>
          <span style={S.dot(phase === "recording")} />
          <span style={S.time}>
            {fmt(elapsedSec)}
            {phase === "paused" ? " ⏸" : ""}
          </span>
          {phase === "recording" ? (
            <button style={S.btn} onClick={onPause}>
              Pause
            </button>
          ) : (
            <button style={S.btn} onClick={onResume}>
              Resume
            </button>
          )}
          <button style={S.stop} onClick={onStop}>
            Stop
          </button>
        </>
      )}
    </div>
  );
}

export function FloatingControls(props: Props) {
  if (!["countdown", "recording", "paused"].includes(props.phase)) return null;
  const ui = <Controls {...props} />;
  if (props.target) return createPortal(ui, props.target.document.body);
  return createPortal(<div style={S.fixed}>{ui}</div>, document.body);
}
