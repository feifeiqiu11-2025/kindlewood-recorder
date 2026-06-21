import { useEffect, useRef, useState } from "react";
import type { Recording } from "../record/useScreenRecorder";
import { downloadBlob, extensionForMimeType } from "../record/recording";
import { emptyProject, type VideoProject } from "../types/project";
import { drawFrame } from "../render/renderFrame";
import { zoomAt } from "../render/zoom";
import { exportVideo } from "../render/exportVideo";
import { Timeline } from "./Timeline";
import "./EditorPanel.css";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const MIN_LEN = 0.3;
const DEFAULT_ZOOM_LEN = 2;

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Draw a crosshair marker so the user can see/place the zoom focus point. */
function drawMarker(ctx: CanvasRenderingContext2D, fx: number, fy: number) {
  const x = fx * ctx.canvas.width;
  const y = fy * ctx.canvas.height;
  const r = Math.max(14, ctx.canvas.width * 0.012);
  ctx.save();
  ctx.strokeStyle = "rgba(255,77,109,0.95)";
  ctx.lineWidth = Math.max(2, ctx.canvas.width * 0.002);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r * 1.6, y);
  ctx.lineTo(x + r * 1.6, y);
  ctx.moveTo(x, y - r * 1.6);
  ctx.lineTo(x, y + r * 1.6);
  ctx.stroke();
  ctx.restore();
}

export function EditorPanel({
  recording,
  onBack,
}: {
  recording: Recording;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef<VideoProject | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [project, setProject] = useState<VideoProject | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  // Resolve the true duration (MediaRecorder webm often reports Infinity until seeked).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const finish = (d: number) => {
      setDuration(d);
      setProject(emptyProject(d));
    };
    const onMeta = () => {
      if (!isFinite(v.duration) || v.duration === 0) {
        const onTU = () => {
          if (isFinite(v.duration) && v.duration > 0) {
            v.removeEventListener("timeupdate", onTU);
            v.currentTime = 0;
            finish(v.duration);
          }
        };
        v.addEventListener("timeupdate", onTU);
        v.currentTime = 1e7;
      } else {
        finish(v.duration);
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    if (v.readyState >= 1) onMeta();
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, []);

  // Single draw loop: keeps the canvas in sync with the video + edits.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      const p = projectRef.current;
      if (v && c && p && v.videoWidth) {
        const ctx = c.getContext("2d");
        if (ctx) {
          if (c.width !== v.videoWidth) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }
          const editingFocus = !!selectedRef.current && v.paused;
          if (editingFocus) {
            drawFrame(ctx, v, { scale: 1, focusX: 0.5, focusY: 0.5 });
            const z = p.zooms.find((b) => b.id === selectedRef.current);
            if (z) drawMarker(ctx, z.focusX, z.focusY);
          } else {
            drawFrame(ctx, v, zoomAt(p, v.currentTime));
          }
        }
        setCurrentTime(v.currentTime);
        if (!v.paused && v.currentTime >= p.trim.endSec) {
          v.pause();
          setPlaying(false);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamp(t, 0, duration);
    setCurrentTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const p = projectRef.current;
    if (!v || !p) return;
    if (v.paused) {
      if (v.currentTime < p.trim.startSec || v.currentTime >= p.trim.endSec) {
        v.currentTime = p.trim.startSec;
      }
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const updateZoom = (id: string, patch: Partial<VideoProject["zooms"][number]>) =>
    setProject((p) =>
      p ? { ...p, zooms: p.zooms.map((z) => (z.id === id ? { ...z, ...patch } : z)) } : p,
    );

  const addZoom = () => {
    if (!project) return;
    const start = clamp(currentTime, project.trim.startSec, project.trim.endSec - MIN_LEN);
    const end = Math.min(start + DEFAULT_ZOOM_LEN, project.trim.endSec);
    const id = crypto.randomUUID();
    setProject({
      ...project,
      zooms: [
        ...project.zooms,
        { id, startSec: start, endSec: end, focusX: 0.5, focusY: 0.5, scale: 1.8, easeSec: 0.4 },
      ].sort((a, b) => a.startSec - b.startSec),
    });
    setSelectedId(id);
    videoRef.current?.pause();
    setPlaying(false);
  };

  const deleteZoom = (id: string) => {
    setProject((p) => (p ? { ...p, zooms: p.zooms.filter((z) => z.id !== id) } : p));
    if (selectedId === id) setSelectedId(null);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = selectedRef.current;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!id || !c || !v || !v.paused) return; // place focus while paused
    const rect = c.getBoundingClientRect();
    updateZoom(id, {
      focusX: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      focusY: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const handleExport = async () => {
    const v = videoRef.current;
    if (!v || !project) return;
    setError(null);
    setExporting(true);
    setExportPct(0);
    v.pause();
    setPlaying(false);
    try {
      const blob = await exportVideo({
        video: v,
        project,
        mimeType: recording.mimeType,
        onProgress: (f) => setExportPct(Math.round(f * 100)),
      });
      const ext = extensionForMimeType(recording.mimeType);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadBlob(blob, `kindlewood-edit-${stamp}.${ext}`);
    } catch {
      setError("Export failed. Try a shorter recording or a different browser.");
    } finally {
      setExporting(false);
      v.currentTime = project.trim.startSec;
    }
  };

  const selected = project?.zooms.find((z) => z.id === selectedId) ?? null;

  return (
    <div className="editor">
      <header className="editor__bar">
        <button className="editor__btn" onClick={onBack} disabled={exporting}>
          ‹ Back
        </button>
        <h1 className="editor__title">Edit</h1>
        <button
          className="editor__btn editor__btn--primary"
          onClick={handleExport}
          disabled={exporting || !project}
        >
          {exporting ? `Exporting ${exportPct}%` : "Export video"}
        </button>
      </header>

      {error && (
        <div className="editor__error" role="alert">
          {error}
        </div>
      )}

      {/* Hidden source video: provides frames + audio for the canvas preview. */}
      <video ref={videoRef} src={recording.url} playsInline className="editor__source" />

      <canvas
        ref={canvasRef}
        className="editor__preview"
        onPointerDown={onCanvasPointerDown}
      />

      <div className="editor__transport">
        <button className="editor__btn" onClick={togglePlay} disabled={!project}>
          {playing ? "Pause" : "Play"}
        </button>
        <span className="editor__time">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <button className="editor__btn" onClick={addZoom} disabled={!project}>
          + Add zoom
        </button>
      </div>

      {project && (
        <Timeline
          duration={duration}
          currentTime={currentTime}
          trim={project.trim}
          zooms={project.zooms}
          selectedId={selectedId}
          onSeek={seek}
          onTrim={(trim) => setProject({ ...project, trim })}
          onSelect={setSelectedId}
          onMoveZoom={(id, startSec, endSec) => updateZoom(id, { startSec, endSec })}
        />
      )}

      {selected ? (
        <div className="editor__inspector">
          <div className="editor__inspector-head">
            <strong>Zoom block</strong>
            <button className="editor__btn editor__btn--danger" onClick={() => deleteZoom(selected.id)}>
              Delete
            </button>
          </div>
          <label className="editor__field">
            Zoom level <span>{selected.scale.toFixed(1)}x</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={selected.scale}
              onChange={(e) => updateZoom(selected.id, { scale: Number(e.target.value) })}
            />
          </label>
          <label className="editor__field">
            Ease <span>{selected.easeSec.toFixed(1)}s</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={selected.easeSec}
              onChange={(e) => updateZoom(selected.id, { easeSec: Number(e.target.value) })}
            />
          </label>
          <p className="editor__hint">
            Pause and click the preview to set where this zoom focuses.
          </p>
        </div>
      ) : (
        <p className="editor__hint editor__hint--center">
          Drag the yellow handles to trim. Add a zoom, then select it to set its
          focus and strength.
        </p>
      )}
    </div>
  );
}
