import { useState } from "react";
import { useScreenRecorder } from "./useScreenRecorder";
import "./RecorderPanel.css";

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function RecorderPanel() {
  const rec = useScreenRecorder();
  const [includeMic, setIncludeMic] = useState(true);

  if (!rec.supported) {
    return (
      <div className="recorder" role="alert">
        <p>
          Your browser doesn’t support screen recording. Try a recent version of
          Chrome, Edge, or Firefox on desktop.
        </p>
      </div>
    );
  }

  return (
    <div className="recorder">
      <header className="recorder__header">
        <h1>KindleWood Recorder</h1>
        <p className="recorder__tagline">Record your screen, then trim and zoom.</p>
      </header>

      {rec.error && (
        <div className="recorder__error" role="alert" aria-live="assertive">
          {rec.error}
        </div>
      )}

      {rec.status === "idle" && (
        <div className="recorder__controls">
          <label className="recorder__toggle">
            <input
              type="checkbox"
              checked={includeMic}
              onChange={(e) => setIncludeMic(e.target.checked)}
            />
            Record microphone
          </label>
          <button
            className="recorder__btn recorder__btn--primary"
            onClick={() => rec.start({ includeMic })}
          >
            Start recording
          </button>
          <p className="recorder__hint">
            You’ll pick a screen, window, or tab to share.
          </p>
        </div>
      )}

      {rec.status === "recording" && (
        <div className="recorder__controls">
          <div className="recorder__live" aria-live="polite">
            <span className="recorder__dot" aria-hidden="true" />
            Recording {formatDuration(rec.elapsedSec)}
          </div>
          <button
            className="recorder__btn recorder__btn--stop"
            onClick={rec.stop}
          >
            Stop recording
          </button>
        </div>
      )}

      {rec.status === "stopped" && rec.recording && (
        <div className="recorder__result">
          <video
            className="recorder__preview"
            src={rec.recording.url}
            controls
            playsInline
          />
          <p className="recorder__meta">
            Length {formatDuration(rec.recording.durationSec)} ·{" "}
            {(rec.recording.blob.size / (1024 * 1024)).toFixed(1)} MB
          </p>
          <div className="recorder__controls">
            <button
              className="recorder__btn recorder__btn--primary"
              onClick={rec.download}
            >
              Download
            </button>
            <button className="recorder__btn" onClick={rec.reset}>
              Record again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
