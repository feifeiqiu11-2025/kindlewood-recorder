import { createPortal } from "react-dom";
import type { CapturePhase } from "../record/useCaptureController";
import { Teleprompter } from "./Teleprompter";

/**
 * Floating presenter surface: recording controls plus an optional teleprompter.
 * Rendered into a Document Picture-in-Picture window when available (so it stays
 * out of tab/window recordings), with a fixed in-page fallback otherwise.
 * Inline styles only — it may live in a separate document.
 */

const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const S = {
  controls: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    flex: "0 0 auto",
  } as React.CSSProperties,
  dot: (on: boolean): React.CSSProperties => ({
    width: 11,
    height: 11,
    borderRadius: "50%",
    background: on ? "#ff4d6d" : "#9aa0b4",
    flex: "0 0 auto",
  }),
  time: { fontVariantNumeric: "tabular-nums", minWidth: 52, fontWeight: 700 } as React.CSSProperties,
  btn: {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #3a3a4f",
    background: "#26263a",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  stop: {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: "none",
    background: "#e23d5b",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  big: { fontSize: 26, fontWeight: 800, padding: "0 6px" } as React.CSSProperties,
  tpRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    flex: "0 0 auto",
    fontSize: 12,
    color: "#c2c2da",
  } as React.CSSProperties,
  slider: { display: "inline-flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  range: { width: 84 } as React.CSSProperties,
};

type Props = {
  target: Window | null;
  phase: CapturePhase;
  countdown: number;
  elapsedSec: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  script: string;
  tpPlaying: boolean;
  tpSpeed: number;
  tpFontSize: number;
  tpResetKey: number;
  onTpToggle: () => void;
  onTpSpeed: (v: number) => void;
  onTpFont: (v: number) => void;
};

function Body(props: Props) {
  const { phase, countdown, elapsedSec, onPause, onResume, onStop, script } = props;
  const hasScript = script.trim().length > 0;
  const rootStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 10,
    minHeight: 0,
    boxSizing: "border-box",
    background: "#16161f",
    color: "#fff",
    font: "600 14px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    ...(props.target
      ? { width: "100%", height: "100%" }
      : {
          width: hasScript ? 460 : "auto",
          height: hasScript ? 340 : "auto",
          borderRadius: 14,
          boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }),
  };

  return (
    <div style={rootStyle}>
      <div style={S.controls}>
        {phase === "countdown" ? (
          <span style={S.big}>{countdown}</span>
        ) : (
          <>
            <span style={S.dot(phase === "recording")} />
            <span style={S.time}>
              {fmt(elapsedSec)}
              {phase === "paused" ? " · paused" : ""}
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

      {hasScript && (
        <>
          <Teleprompter
            text={script}
            playing={props.tpPlaying}
            speed={props.tpSpeed}
            fontSize={props.tpFontSize}
            resetKey={props.tpResetKey}
          />
          <div style={S.tpRow}>
            <button style={S.btn} onClick={props.onTpToggle}>
              {props.tpPlaying ? "Pause scroll" : "Start scroll"}
            </button>
            <label style={S.slider}>
              Speed
              <input
                style={S.range}
                type="range"
                min={10}
                max={140}
                step={5}
                value={props.tpSpeed}
                onChange={(e) => props.onTpSpeed(Number(e.target.value))}
              />
            </label>
            <label style={S.slider}>
              Size
              <input
                style={S.range}
                type="range"
                min={16}
                max={44}
                step={2}
                value={props.tpFontSize}
                onChange={(e) => props.onTpFont(Number(e.target.value))}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export function PresenterOverlay(props: Props) {
  if (!["countdown", "recording", "paused"].includes(props.phase)) return null;
  const body = <Body {...props} />;
  if (props.target) return createPortal(body, props.target.document.body);
  return createPortal(
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 2147483647 }}>
      {body}
    </div>,
    document.body,
  );
}
