import { useEffect, useRef, useState } from "react";
import { useCaptureController } from "../record/useCaptureController";
import { downloadBlob, extensionForMimeType } from "../record/recording";
import { emptyProject, type VideoProject } from "../types/project";
import { drawFrame } from "../render/renderFrame";
import { zoomAt } from "../render/zoom";
import { exportVideo } from "../render/exportVideo";
import { LeftRail, type RailTab } from "./LeftRail";
import { Tracks } from "./Tracks";
import { FloatingControls } from "./FloatingControls";
import { ActionBar } from "./ActionBar";
import { dbToGain } from "./audio";
import { ASPECTS, aspectCss, aspectDims, type Aspect } from "./aspect";
import { SoundsIcon, MusicIcon, ZoomIcon } from "./icons";
import "./Studio.css";

const MAX_PREVIEW_WIDTH = 1600;
const BASE_PX_PER_SEC = 70;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const MIN_LEN = 0.3;
const DEFAULT_ZOOM_LEN = 2;
const fmt = (t: number) =>
  `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;

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

export function Studio() {
  const cap = useCaptureController();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef<VideoProject | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [project, setProject] = useState<VideoProject | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [aspect, setAspect] = useState<Aspect>("16:9");

  const editing = !!cap.recording;
  const pixelsPerSec = BASE_PX_PER_SEC * zoomLevel;

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  // Close the floating PiP window when recording ends.
  useEffect(() => {
    if ((cap.phase === "stopped" || cap.phase === "idle") && pipWindow) {
      pipWindow.close();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- detach from the now-closed external window
      setPipWindow(null);
    }
  }, [cap.phase, pipWindow]);

  // When a recording lands, load it into the editor.
  // MediaRecorder WebM blobs report duration = Infinity (no duration in the
  // live-stream header). Rather than the risky seek-to-1e7 hack (which can
  // OOM-crash the renderer), fall back to the wall-clock duration the capture
  // controller already measured.
  useEffect(() => {
    const rec = cap.recording;
    const v = videoRef.current;
    if (!rec || !v) return;
    v.src = rec.url;
    setActiveTab("zoom");
    const init = () => {
      const d =
        isFinite(v.duration) && v.duration > 0 ? v.duration : rec.durationSec;
      const safe = Math.max(0.1, d);
      setDuration(safe);
      setProject(emptyProject(safe));
      setCurrentTime(0);
    };
    v.addEventListener("loadedmetadata", init);
    if (v.readyState >= 1) init();
    return () => v.removeEventListener("loadedmetadata", init);
  }, [cap.recording]);

  // Editor draw loop: keep the preview canvas synced with the video + edits.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      const p = projectRef.current;
      if (v && c && p && v.videoWidth) {
        const ctx = c.getContext("2d");
        if (ctx) {
          const sc = Math.min(1, MAX_PREVIEW_WIDTH / v.videoWidth);
          const cw = Math.round(v.videoWidth * sc);
          const ch = Math.round(v.videoHeight * sc);
          if (c.width !== cw) {
            c.width = cw;
            c.height = ch;
          }
          const editFocus = !!selectedRef.current && v.paused;
          if (editFocus) {
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
    setActiveTab("zoom");
    videoRef.current?.pause();
    setPlaying(false);
  };

  const deleteZoom = (id: string) => {
    setProject((p) => (p ? { ...p, zooms: p.zooms.filter((z) => z.id !== id) } : p));
    if (selectedId === id) setSelectedId(null);
  };

  // Split the selected zoom block at the playhead into two adjacent blocks.
  const splitSelectedZoom = () => {
    if (!project || !selectedId) return;
    const z = project.zooms.find((b) => b.id === selectedId);
    if (!z) return;
    const t = currentTime;
    if (t <= z.startSec + MIN_LEN || t >= z.endSec - MIN_LEN) return;
    const left = { ...z, endSec: t };
    const right = { ...z, id: crypto.randomUUID(), startSec: t };
    setProject({
      ...project,
      zooms: project.zooms
        .flatMap((b) => (b.id === z.id ? [left, right] : [b]))
        .sort((a, b) => a.startSec - b.startSec),
    });
    setSelectedId(left.id);
  };

  const setVolumeDb = (db: number) =>
    setProject((p) => (p ? { ...p, audio: { ...p.audio, volumeDb: db } } : p));

  // Apply the Voice volume to preview playback (boost above 0dB is clamped by
  // the media element; true gain in the export is a follow-up).
  useEffect(() => {
    if (videoRef.current && project) {
      videoRef.current.volume = Math.min(1, dbToGain(project.audio.volumeDb));
    }
  }, [project?.audio.volumeDb, project]);

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = selectedRef.current;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!id || !c || !v || !v.paused) return;
    const rect = c.getBoundingClientRect();
    updateZoom(id, {
      focusX: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      focusY: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const handleExport = async () => {
    const v = videoRef.current;
    if (!v || !project || !cap.recording) return;
    setExportError(null);
    setExporting(true);
    setExportPct(0);
    v.pause();
    setPlaying(false);
    try {
      const blob = await exportVideo({
        video: v,
        project,
        mimeType: cap.recording.mimeType,
        output: aspectDims(aspect),
        onProgress: (f) => setExportPct(Math.round(f * 100)),
      });
      const ext = extensionForMimeType(cap.recording.mimeType);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadBlob(blob, `kindlewood-edit-${stamp}.${ext}`);
    } catch {
      setExportError("Export failed. Try a shorter clip or a different browser.");
    } finally {
      setExporting(false);
      v.currentTime = project.trim.startSec;
    }
  };

  // Opened from the Start click (a user gesture, required by the DPiP API).
  // Fire-and-forget so the PiP window never blocks or derails recording — the
  // in-page floating bar covers the case where it fails or is unsupported.
  const startRecording = () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    dpip
      ?.requestWindow({ width: 300, height: 92 })
      .then((w) => {
        w.document.body.style.cssText =
          "margin:0;display:flex;align-items:center;justify-content:center;background:#16161f";
        w.document.title = "Recording";
        w.addEventListener("pagehide", () => setPipWindow(null));
        setPipWindow(w);
      })
      .catch(() => {});
    cap.arm();
  };

  const newRecording = () => {
    setProject(null);
    setDuration(0);
    setSelectedId(null);
    setActiveTab(null);
    cap.reset();
  };

  const selected = project?.zooms.find((z) => z.id === selectedId) ?? null;
  const canSplit =
    !!selected &&
    currentTime > selected.startSec + MIN_LEN &&
    currentTime < selected.endSec - MIN_LEN;
  const splitTitle = selected
    ? canSplit
      ? "Split zoom at playhead"
      : "Move the playhead inside the selected zoom to split"
    : "Select a zoom block to split";

  const zoomPanel = (
    <div className="panel">
      <button className="btn btn--primary panel__add" onClick={addZoom} disabled={!editing}>
        + Add zoom at playhead
      </button>
      {selected ? (
        <div className="panel__zoom">
          <div className="panel__zoom-head">
            <strong>Selected zoom</strong>
            <button className="btn btn--danger btn--sm" onClick={() => deleteZoom(selected.id)}>
              Delete
            </button>
          </div>
          <label className="field">
            Zoom <span>{selected.scale.toFixed(1)}x</span>
            <input type="range" min={1} max={3} step={0.1} value={selected.scale}
              onChange={(e) => updateZoom(selected.id, { scale: Number(e.target.value) })} />
          </label>
          <label className="field">
            Ease <span>{selected.easeSec.toFixed(1)}s</span>
            <input type="range" min={0} max={1.5} step={0.1} value={selected.easeSec}
              onChange={(e) => updateZoom(selected.id, { easeSec: Number(e.target.value) })} />
          </label>
          <p className="hint">Pause and click the preview to set the focus point.</p>
        </div>
      ) : (
        <p className="hint">
          {editing
            ? "Add a zoom, then select its block to set focus and strength."
            : "Record something first, then add zoom effects here."}
        </p>
      )}
    </div>
  );

  const placeholder = (what: string) => (
    <div className="panel">
      <p className="hint">{what} will be ported from the KindleWood audio editor.</p>
    </div>
  );

  const tabs: RailTab[] = [
    { id: "sounds", icon: <SoundsIcon />, label: "Sounds", content: placeholder("A sound-effects library") },
    { id: "music", icon: <MusicIcon />, label: "Music", content: placeholder("A background-music library") },
    { id: "zoom", icon: <ZoomIcon />, label: "Effects", content: zoomPanel },
  ];

  return (
    <div className="studio">
      <LeftRail tabs={tabs} activeId={activeTab} onChange={setActiveTab} />

      <div className="studio__main">
        <header className="studio__header">
          <h1 className="studio__title">KindleWood Recorder</h1>
          <div className="studio__header-actions">
            <div className="segmented" role="group" aria-label="Aspect ratio">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  className={`segmented__btn${aspect === a ? " is-active" : ""}`}
                  onClick={() => setAspect(a)}
                  aria-pressed={aspect === a}
                  title={`Frame ${a}`}
                >
                  {a}
                </button>
              ))}
            </div>
            {editing && (
              <button className="btn" onClick={newRecording} disabled={exporting}>
                New recording
              </button>
            )}
            <button
              className="btn btn--primary"
              onClick={handleExport}
              disabled={!editing || exporting}
            >
              {exporting ? `Exporting ${exportPct}%` : "Export video"}
            </button>
          </div>
        </header>

        {(cap.error || exportError) && (
          <div className="studio__error" role="alert">
            {cap.error || exportError}
          </div>
        )}

        {/* Hidden source video used for editing/export. */}
        <video ref={videoRef} playsInline className="studio__source" />

        <div className="stage" style={{ aspectRatio: aspectCss(aspect) }}>
          {editing ? (
            <canvas ref={canvasRef} className="stage__canvas" onPointerDown={onCanvasPointerDown} />
          ) : cap.displayStream ? (
            <div className="stage__live">
              {/* Live mirror of the captured surface — confirms what's recorded. */}
              <video
                autoPlay
                muted
                playsInline
                className="stage__canvas"
                ref={(el) => {
                  if (el && el.srcObject !== cap.displayStream) el.srcObject = cap.displayStream;
                }}
              />
              {cap.cameraStream && (
                <video
                  autoPlay
                  muted
                  playsInline
                  className="stage__pip"
                  ref={(el) => {
                    if (el && el.srcObject !== cap.cameraStream) el.srcObject = cap.cameraStream;
                  }}
                />
              )}
              {cap.phase === "countdown" && (
                <div className="stage__countdown" aria-live="assertive">
                  {cap.countdown}
                </div>
              )}
              {cap.phase === "recording" && (
                <div className="stage__rec">
                  <span className="stage__rec-dot" />
                  REC
                </div>
              )}
              {cap.phase === "paused" && (
                <div className="stage__rec stage__rec--paused">Paused</div>
              )}
            </div>
          ) : (
            <div className="stage__placeholder">
              <p>Set up a recording to begin.</p>
            </div>
          )}
        </div>

        <FloatingControls
          target={pipWindow}
          phase={cap.phase}
          countdown={cap.countdown}
          elapsedSec={cap.elapsedSec}
          onPause={cap.pause}
          onResume={cap.resume}
          onStop={cap.stop}
        />

        {/* Transport / record bar */}
        {editing ? (
          <ActionBar
            playing={playing}
            onTogglePlay={togglePlay}
            canSplit={canSplit}
            splitTitle={splitTitle}
            onSplit={splitSelectedZoom}
            zoomLevel={zoomLevel}
            onZoomOut={() => setZoomLevel((z) => Math.max(0.25, z / 1.25))}
            onZoomIn={() => setZoomLevel((z) => Math.min(4, z * 1.25))}
            onResetZoom={() => setZoomLevel(1)}
            volumeDb={project?.audio.volumeDb ?? 0}
            onVolume={setVolumeDb}
            canDelete={!!selectedId}
            onDelete={() => selectedId && deleteZoom(selectedId)}
          />
        ) : (
          <div className="bar">
            <RecordControls cap={cap} onStart={startRecording} />
          </div>
        )}

        {project ? (
          <Tracks
            duration={duration}
            pixelsPerSec={pixelsPerSec}
            currentTime={currentTime}
            trim={project.trim}
            zooms={project.zooms}
            selectedId={selectedId}
            hasVideo={editing}
            onSeek={seek}
            onTrim={(trim) => setProject({ ...project, trim })}
            onSelectZoom={setSelectedId}
            onMoveZoom={(id, startSec, endSec) => updateZoom(id, { startSec, endSec })}
          />
        ) : (
          <Tracks
            duration={1}
            pixelsPerSec={pixelsPerSec}
            currentTime={0}
            trim={{ startSec: 0, endSec: 1 }}
            zooms={[]}
            selectedId={null}
            hasVideo={false}
            onSeek={() => {}}
            onTrim={() => {}}
            onSelectZoom={() => {}}
            onMoveZoom={() => {}}
          />
        )}
      </div>
    </div>
  );
}

function RecordControls({
  cap,
  onStart,
}: {
  cap: ReturnType<typeof useCaptureController>;
  onStart: () => void;
}) {
  const { phase, settings, setSettings } = cap;
  if (phase === "idle") {
    return (
      <>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.mic}
            onChange={(e) => setSettings((s) => ({ ...s, mic: e.target.checked }))}
          />
          Microphone
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.camera}
            onChange={(e) => setSettings((s) => ({ ...s, camera: e.target.checked }))}
          />
          Camera
        </label>
        <button className="btn btn--primary" onClick={cap.setup} disabled={!cap.supported}>
          Set up recording
        </button>
      </>
    );
  }
  if (phase === "ready") {
    return (
      <>
        <span className="bar__hint">Ready — press start when you are.</span>
        <button className="btn btn--rec" onClick={onStart}>Start (3·2·1)</button>
        <button className="btn" onClick={cap.cancel}>Cancel</button>
      </>
    );
  }
  if (phase === "countdown") {
    return (
      <>
        <span className="bar__hint">Starting in {cap.countdown}…</span>
        <button className="btn" onClick={cap.cancel}>Cancel</button>
      </>
    );
  }
  if (phase === "recording") {
    return (
      <>
        <span className="bar__time">{fmt(cap.elapsedSec)}</span>
        <button className="btn" onClick={cap.pause}>Pause</button>
        <button className="btn btn--rec" onClick={cap.stop}>Stop</button>
      </>
    );
  }
  if (phase === "paused") {
    return (
      <>
        <span className="bar__time">{fmt(cap.elapsedSec)} (paused)</span>
        <button className="btn btn--primary" onClick={cap.resume}>Resume</button>
        <button className="btn btn--rec" onClick={cap.stop}>Stop</button>
      </>
    );
  }
  return null;
}
