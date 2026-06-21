import {
  PlayIcon,
  PauseIcon,
  ScissorsIcon,
  ZoomInIcon,
  ZoomOutIcon,
  TrashIcon,
} from "./icons";
import "./ActionBar.css";

type ActionBarProps = {
  playing: boolean;
  onTogglePlay: () => void;
  canSplit: boolean;
  splitTitle: string;
  onSplit: () => void;
  zoomLevel: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  volumeDb: number;
  onVolume: (db: number) => void;
  canDelete: boolean;
  onDelete: () => void;
};

/**
 * Editor transport / action bar, styled after KindleWood's audio editor:
 * play · split · zoom out / % / zoom in · Voice volume · delete.
 */
export function ActionBar({
  playing,
  onTogglePlay,
  canSplit,
  splitTitle,
  onSplit,
  zoomLevel,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  volumeDb,
  onVolume,
  canDelete,
  onDelete,
}: ActionBarProps) {
  return (
    <div className="actionbar">
      <button className="actionbar__icon" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        className="actionbar__icon"
        onClick={onSplit}
        disabled={!canSplit}
        aria-label="Split at playhead"
        title={splitTitle}
      >
        <ScissorsIcon />
      </button>

      <div className="actionbar__zoom">
        <button
          className="actionbar__icon"
          onClick={onZoomOut}
          disabled={zoomLevel <= 0.25}
          aria-label="Zoom out timeline"
          title="Zoom out"
        >
          <ZoomOutIcon />
        </button>
        <button
          className="actionbar__pct"
          onClick={onResetZoom}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button
          className="actionbar__icon"
          onClick={onZoomIn}
          disabled={zoomLevel >= 4}
          aria-label="Zoom in timeline"
          title="Zoom in"
        >
          <ZoomInIcon />
        </button>
      </div>

      <span className="actionbar__track">Voice</span>
      <label className="actionbar__vol">
        <span className="actionbar__vol-label">VOL</span>
        <input
          type="range"
          min={-30}
          max={6}
          step={1}
          value={volumeDb}
          onChange={(e) => onVolume(Number(e.target.value))}
          aria-label="Voice volume in dB"
          style={{ accentColor: "#5b3df5" }}
        />
        <span className="actionbar__db">{volumeDb}dB</span>
      </label>

      <span className="actionbar__spacer" />

      <button
        className="actionbar__icon actionbar__icon--danger"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete selected zoom"
        title={canDelete ? "Delete selected zoom" : "Select a zoom block to delete"}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
