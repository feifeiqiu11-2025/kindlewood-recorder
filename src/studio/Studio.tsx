import { useEffect, useRef, useState } from "react";
import { useCaptureController } from "../record/useCaptureController";
import { downloadBlob, extensionForMimeType } from "../record/recording";
import {
  emptyProject,
  keptDuration,
  segmentAtSource,
  sourceToTimeline,
  timelineToSource,
  segmentTimelineStart,
  type VideoProject,
} from "../types/project";
import { drawFrame } from "../render/renderFrame";
import { zoomAt } from "../render/zoom";
import { exportVideo } from "../render/exportVideo";
import { LeftRail, type RailTab } from "./LeftRail";
import { Tracks } from "./Tracks";
import { PresenterOverlay } from "./PresenterOverlay";
import { ScriptPanel } from "./ScriptPanel";
import { ActionBar } from "./ActionBar";
import { dbToGain } from "./audio";
import { ASPECTS, aspectCss, aspectDims, type Aspect } from "./aspect";
import { ZoomTargetOverlay } from "./ZoomTargetOverlay";
import { focusFromClient } from "./stageGeometry";
import { SoundsIcon, MusicIcon, ZoomIcon, ScriptIcon } from "./icons";
import "./Studio.css";

const aspectNum = (a: Aspect) => (a === "16:9" ? 16 / 9 : a === "9:16" ? 9 / 16 : 1);

const MAX_PREVIEW_WIDTH = 1600;
const BASE_PX_PER_SEC = 70;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const MIN_LEN = 0.3;
const DEFAULT_ZOOM_LEN = 2;
const fmt = (t: number) =>
  `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;

export function Studio() {
  const cap = useCaptureController();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef<VideoProject | null>(null);
  const selectedRef = useRef<string | null>(null);
  const exportingRef = useRef(false);

  const [project, setProject] = useState<VideoProject | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStage, setExportStage] = useState<"render" | "convert">("render");
  const [exportError, setExportError] = useState<string | null>(null);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [aspect, setAspect] = useState<Aspect>("16:9");

  // Teleprompter (presenter aid — never recorded or exported).
  const [script, setScript] = useState("");
  const [tpPlaying, setTpPlaying] = useState(true);
  const [tpSpeed, setTpSpeed] = useState(45);
  const [tpFontSize, setTpFontSize] = useState(26);
  const [tpResetKey, setTpResetKey] = useState(0);

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
      setProject(emptyProject(safe));
      setCurrentTime(0);
      if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
    };
    v.addEventListener("loadedmetadata", init);
    if (v.readyState >= 1) init();
    return () => v.removeEventListener("loadedmetadata", init);
  }, [cap.recording]);

  // Editor draw loop: keep the preview canvas synced with the video + edits.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      // During export the exporter drives the same <video>; don't fight it.
      if (exportingRef.current) {
        raf = requestAnimationFrame(loop);
        return;
      }
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
          // Timeline (output) time for this source position.
          const tlTime = sourceToTimeline(p, v.currentTime);
          // While a zoom block is selected and paused, show the full frame so
          // the target box (HTML overlay) can be placed against real content.
          const editingZoom = p.zooms.some((b) => b.id === selectedRef.current);
          if (editingZoom && v.paused) {
            drawFrame(ctx, v, { scale: 1, focusX: 0.5, focusY: 0.5 });
          } else {
            drawFrame(ctx, v, zoomAt(p, tlTime));
          }
          setCurrentTime(tlTime);
        }
        if (!v.paused) {
          // Ripple playback: at a segment's end, jump to the next segment's
          // source start (skipping deleted gaps); stop after the last one.
          const at = segmentAtSource(p, v.currentTime);
          if (!at) {
            const next = p.segments.find((s) => s.sourceStart > v.currentTime - 1e-6);
            if (next) v.currentTime = next.sourceStart;
            else {
              v.pause();
              setPlaying(false);
            }
          } else if (v.currentTime >= at.seg.sourceEnd - 1e-3) {
            const nextIdx = at.index + 1;
            if (nextIdx < p.segments.length) v.currentTime = p.segments[nextIdx].sourceStart;
            else {
              v.pause();
              setPlaying(false);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // `t` is TIMELINE time; map it to the source position for the media element.
  const seek = (t: number) => {
    const v = videoRef.current;
    const p = projectRef.current;
    if (!v || !p) return;
    const tl = clamp(t, 0, keptDuration(p));
    v.currentTime = timelineToSource(p, tl).sourceTime;
    setCurrentTime(tl);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const p = projectRef.current;
    if (!v || !p) return;
    if (v.paused) {
      const total = keptDuration(p);
      if (sourceToTimeline(p, v.currentTime) >= total - 0.05) {
        v.currentTime = timelineToSource(p, 0).sourceTime;
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
    const total = keptDuration(project);
    const start = clamp(currentTime, 0, total - MIN_LEN);
    const end = Math.min(start + DEFAULT_ZOOM_LEN, total);
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

  // Split the selected clip (video segment or zoom block) at the playhead.
  const splitSelected = () => {
    if (!project || !selectedId) return;
    const t = currentTime; // timeline time
    const seg = project.segments.find((s) => s.id === selectedId);
    if (seg) {
      const segTl = segmentTimelineStart(project, seg.id);
      const dur = seg.sourceEnd - seg.sourceStart;
      if (t <= segTl + MIN_LEN || t >= segTl + dur - MIN_LEN) return;
      const srcMid = seg.sourceStart + (t - segTl);
      const left = { ...seg, sourceEnd: srcMid };
      const right = { ...seg, id: crypto.randomUUID(), sourceStart: srcMid };
      setProject({
        ...project,
        segments: project.segments
          .flatMap((s) => (s.id === seg.id ? [left, right] : [s]))
          .sort((a, b) => a.sourceStart - b.sourceStart),
      });
      setSelectedId(left.id);
      return;
    }
    const z = project.zooms.find((b) => b.id === selectedId);
    if (z) {
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
    }
  };

  // Delete the selected clip. Won't remove the last remaining video segment.
  const deleteSelected = () => {
    if (!project || !selectedId) return;
    if (project.zooms.some((z) => z.id === selectedId)) {
      setProject({ ...project, zooms: project.zooms.filter((z) => z.id !== selectedId) });
      setSelectedId(null);
    } else if (
      project.segments.some((s) => s.id === selectedId) &&
      project.segments.length > 1
    ) {
      setProject({ ...project, segments: project.segments.filter((s) => s.id !== selectedId) });
      setSelectedId(null);
    }
  };

  // Trim a segment's SOURCE range (Tracks passes desired source bounds).
  const trimSegment = (id: string, sourceStart: number, sourceEnd: number) =>
    setProject((p) => {
      if (!p) return p;
      const segs = [...p.segments].sort((a, b) => a.sourceStart - b.sourceStart);
      const i = segs.findIndex((s) => s.id === id);
      if (i < 0) return p;
      const lo = i > 0 ? segs[i - 1].sourceEnd : 0;
      const hi = i < segs.length - 1 ? segs[i + 1].sourceStart : p.sourceDurationSec;
      const ss = clamp(sourceStart, lo, sourceEnd - MIN_LEN);
      const se = clamp(sourceEnd, ss + MIN_LEN, hi);
      segs[i] = { ...segs[i], sourceStart: ss, sourceEnd: se };
      return { ...p, segments: segs };
    });

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
    const v = videoRef.current;
    const c = canvasRef.current;
    const p = projectRef.current;
    if (!v || !c || !p || !v.paused) return;
    const z = p.zooms.find((b) => b.id === selectedRef.current);
    if (!z) return;
    const rect = c.getBoundingClientRect();
    const va = v.videoWidth / v.videoHeight || 16 / 9;
    updateZoom(z.id, focusFromClient(e.clientX, e.clientY, rect, va, aspectNum(aspect)));
  };

  const handleExport = async () => {
    const v = videoRef.current;
    if (!v || !project || !cap.recording) return;
    setExportError(null);
    setExporting(true);
    setExportPct(0);
    setExportStage("render");
    exportingRef.current = true;
    v.pause();
    setPlaying(false);
    try {
      const webm = await exportVideo({
        video: v,
        project,
        mimeType: cap.recording.mimeType,
        output: aspectDims(aspect),
        onProgress: (f) => setExportPct(Math.round(f * 100)),
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      if (format === "mp4") {
        setExportStage("convert");
        setExportPct(0);
        // Lazy-load ffmpeg.wasm so it never bloats the normal bundle.
        const { transcodeToMp4 } = await import("../render/transcodeMp4");
        const mp4 = await transcodeToMp4(webm, {
          onProgress: (f) => setExportPct(Math.round(f * 100)),
        });
        downloadBlob(mp4, `kindlewood-edit-${stamp}.mp4`);
      } else {
        const ext = extensionForMimeType(cap.recording.mimeType);
        downloadBlob(webm, `kindlewood-edit-${stamp}.${ext}`);
      }
    } catch (err) {
      console.error("Export failed:", err);
      setExportError(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      exportingRef.current = false;
      setExporting(false);
      v.currentTime = project.segments[0].sourceStart;
    }
  };

  // Opened from the Start click (a user gesture, required by the DPiP API).
  // Fire-and-forget so the PiP window never blocks or derails recording — the
  // in-page floating bar covers the case where it fails or is unsupported.
  const startRecording = () => {
    const hasScript = script.trim().length > 0;
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    dpip
      ?.requestWindow(hasScript ? { width: 460, height: 340 } : { width: 300, height: 96 })
      .then((w) => {
        w.document.body.style.cssText = "margin:0;background:#16161f";
        w.document.title = hasScript ? "Teleprompter" : "Recording";
        w.addEventListener("pagehide", () => setPipWindow(null));
        setPipWindow(w);
      })
      .catch(() => {});
    setTpResetKey((k) => k + 1);
    setTpPlaying(true);
    cap.arm();
  };

  const newRecording = () => {
    setProject(null);
    setSelectedId(null);
    setActiveTab(null);
    cap.reset();
  };

  const selectedZoom = project?.zooms.find((z) => z.id === selectedId) ?? null;
  const selectedSegment = project?.segments.find((s) => s.id === selectedId) ?? null;
  let canSplit = false;
  if (selectedZoom) {
    canSplit =
      currentTime > selectedZoom.startSec + MIN_LEN &&
      currentTime < selectedZoom.endSec - MIN_LEN;
  } else if (selectedSegment && project) {
    const segTl = segmentTimelineStart(project, selectedSegment.id);
    const dur = selectedSegment.sourceEnd - selectedSegment.sourceStart;
    canSplit = currentTime > segTl + MIN_LEN && currentTime < segTl + dur - MIN_LEN;
  }
  const canDelete =
    !!selectedZoom || (!!selectedSegment && (project?.segments.length ?? 0) > 1);
  const splitTitle =
    selectedZoom || selectedSegment
      ? canSplit
        ? "Split at playhead"
        : "Move the playhead inside the selected clip to split"
      : "Select a clip to split";

  const zoomPanel = (
    <div className="panel">
      <button className="btn btn--primary panel__add" onClick={addZoom} disabled={!editing}>
        + Add zoom at playhead
      </button>
      {selectedZoom ? (
        <div className="panel__zoom">
          <div className="panel__zoom-head">
            <strong>Selected zoom</strong>
            <button className="btn btn--danger btn--sm" onClick={() => deleteZoom(selectedZoom.id)}>
              Delete
            </button>
          </div>
          <label className="field">
            Zoom <span>{selectedZoom.scale.toFixed(1)}x</span>
            <input type="range" min={1} max={3} step={0.1} value={selectedZoom.scale}
              onChange={(e) => updateZoom(selectedZoom.id, { scale: Number(e.target.value) })} />
          </label>
          <label className="field">
            Ease <span>{selectedZoom.easeSec.toFixed(1)}s</span>
            <input type="range" min={0} max={1.5} step={0.1} value={selectedZoom.easeSec}
              onChange={(e) => updateZoom(selectedZoom.id, { easeSec: Number(e.target.value) })} />
          </label>
          <p className="hint">Pause, then drag the target box on the preview to aim the zoom — drag its corner to set strength.</p>
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
    { id: "script", icon: <ScriptIcon />, label: "Script", content: <ScriptPanel value={script} onChange={setScript} /> },
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
            <div className="segmented" role="group" aria-label="Export format">
              {(["mp4", "webm"] as const).map((f) => (
                <button
                  key={f}
                  className={`segmented__btn${format === f ? " is-active" : ""}`}
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  disabled={exporting}
                  title={f === "mp4" ? "H.264 MP4 — works on X, CapCut, everywhere" : "WebM — fast, great for YouTube"}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              className="btn btn--primary"
              onClick={handleExport}
              disabled={!editing || exporting}
            >
              {exporting
                ? exportStage === "convert"
                  ? `Converting ${exportPct}%`
                  : `Rendering ${exportPct}%`
                : `Export ${format.toUpperCase()}`}
            </button>
          </div>
        </header>

        {cap.displaySurface === "monitor" &&
          script.trim().length > 0 &&
          ["ready", "countdown", "recording", "paused"].includes(cap.phase) && (
            <div className="studio__warn" role="status">
              You’re sharing your entire screen, so the teleprompter window will
              be visible in the recording. Share a window or tab instead to keep
              it hidden.
            </div>
          )}

        {(cap.error || exportError) && (
          <div className="studio__error" role="alert">
            {cap.error || exportError}
          </div>
        )}

        {/* Hidden source video used for editing/export. */}
        <video ref={videoRef} playsInline className="studio__source" />

        <div className="stage" style={{ aspectRatio: aspectCss(aspect) }}>
          {editing ? (
            <>
              <canvas ref={canvasRef} className="stage__canvas" onPointerDown={onCanvasPointerDown} />
              {selectedZoom && !playing && (
                <ZoomTargetOverlay
                  focusX={selectedZoom.focusX}
                  focusY={selectedZoom.focusY}
                  scale={selectedZoom.scale}
                  videoAspect={videoAspect}
                  stageAspect={aspectNum(aspect)}
                  onChange={(patch) => updateZoom(selectedZoom.id, patch)}
                />
              )}
            </>
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
                  className={`stage__pip stage__pip--${cap.settings.cameraShape}`}
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

        <PresenterOverlay
          target={pipWindow}
          phase={cap.phase}
          countdown={cap.countdown}
          elapsedSec={cap.elapsedSec}
          onPause={cap.pause}
          onResume={cap.resume}
          onStop={cap.stop}
          script={script}
          tpPlaying={tpPlaying}
          tpSpeed={tpSpeed}
          tpFontSize={tpFontSize}
          tpResetKey={tpResetKey}
          onTpToggle={() => setTpPlaying((p) => !p)}
          onTpSpeed={setTpSpeed}
          onTpFont={setTpFontSize}
        />

        {/* Transport / record bar */}
        {editing ? (
          <ActionBar
            playing={playing}
            onTogglePlay={togglePlay}
            canSplit={canSplit}
            splitTitle={splitTitle}
            onSplit={splitSelected}
            zoomLevel={zoomLevel}
            onZoomOut={() => setZoomLevel((z) => Math.max(0.25, z / 1.25))}
            onZoomIn={() => setZoomLevel((z) => Math.min(4, z * 1.25))}
            onResetZoom={() => setZoomLevel(1)}
            volumeDb={project?.audio.volumeDb ?? 0}
            onVolume={setVolumeDb}
            canDelete={canDelete}
            onDelete={deleteSelected}
          />
        ) : (
          <div className="bar">
            <RecordControls cap={cap} onStart={startRecording} />
          </div>
        )}

        {project ? (
          <Tracks
            duration={keptDuration(project)}
            pixelsPerSec={pixelsPerSec}
            currentTime={currentTime}
            segments={project.segments}
            zooms={project.zooms}
            selectedId={selectedId}
            hasVideo={editing}
            onSeek={seek}
            onSelect={setSelectedId}
            onMoveZoom={(id, startSec, endSec) => updateZoom(id, { startSec, endSec })}
            onTrimSegment={trimSegment}
          />
        ) : (
          <Tracks
            duration={1}
            pixelsPerSec={pixelsPerSec}
            currentTime={0}
            segments={[]}
            zooms={[]}
            selectedId={null}
            hasVideo={false}
            onSeek={() => {}}
            onSelect={() => {}}
            onMoveZoom={() => {}}
            onTrimSegment={() => {}}
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
        <label className="check">
          <input
            type="checkbox"
            checked={settings.mic}
            onChange={(e) => setSettings((s) => ({ ...s, mic: e.target.checked }))}
          />
          <span>Microphone</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.camera}
            onChange={(e) => setSettings((s) => ({ ...s, camera: e.target.checked }))}
          />
          <span>Camera</span>
        </label>
        {settings.camera && (
          <div className="segmented" role="group" aria-label="Camera shape">
            {(["rounded", "circle", "square"] as const).map((sh) => (
              <button
                key={sh}
                className={`segmented__btn${settings.cameraShape === sh ? " is-active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, cameraShape: sh }))}
                aria-pressed={settings.cameraShape === sh}
              >
                {sh[0].toUpperCase() + sh.slice(1)}
              </button>
            ))}
          </div>
        )}
        <span className="bar__spacer" />
        <button className="btn btn--primary" onClick={cap.setup} disabled={!cap.supported}>
          Set up recording
        </button>
      </>
    );
  }
  if (phase === "ready") {
    return (
      <>
        <span className="bar__hint">Ready when you are.</span>
        <span className="bar__spacer" />
        <button className="btn" onClick={cap.cancel}>Cancel</button>
        <button className="btn btn--rec" onClick={onStart}>Start recording</button>
      </>
    );
  }
  if (phase === "countdown") {
    return (
      <>
        <span className="bar__spacer" />
        <button className="btn btn--rec" disabled>Starting in {cap.countdown}…</button>
        <button className="btn" onClick={cap.cancel}>Cancel</button>
      </>
    );
  }
  if (phase === "recording") {
    return (
      <>
        <span className="bar__time">{fmt(cap.elapsedSec)}</span>
        <span className="bar__spacer" />
        <button className="btn" onClick={cap.pause}>Pause</button>
        <button className="btn btn--rec" onClick={cap.stop}>Stop</button>
      </>
    );
  }
  if (phase === "paused") {
    return (
      <>
        <span className="bar__time">{fmt(cap.elapsedSec)} · paused</span>
        <span className="bar__spacer" />
        <button className="btn" onClick={cap.stop}>Stop</button>
        <button className="btn btn--primary" onClick={cap.resume}>Resume</button>
      </>
    );
  }
  return null;
}
