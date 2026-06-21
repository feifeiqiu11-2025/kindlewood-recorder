import { useCallback, useEffect, useRef, useState } from "react";
import { pickSupportedMimeType } from "./recording";

export type CapturePhase =
  | "idle"
  | "ready"
  | "countdown"
  | "recording"
  | "paused"
  | "stopped";

export type CameraShape = "rounded" | "circle" | "square";
export type CaptureSettings = {
  mic: boolean;
  camera: boolean;
  cameraShape: CameraShape;
};

export type Recording = {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSec: number;
};

/** Camera picture-in-picture geometry, relative to the frame width. */
const PIP_WIDTH_PCT = 0.22;
const PIP_MARGIN_PCT = 0.025;
const COUNTDOWN_FROM = 3;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const isSupported = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  typeof MediaRecorder !== "undefined";

/**
 * Drives the full recording lifecycle for the studio:
 *   idle → (setup picks screen + mic/camera) → ready → countdown → recording
 *        ⇄ paused → stopped (produces a Recording).
 *
 * When the camera is enabled, the screen and webcam are composited onto an
 * offscreen canvas (webcam as a rounded PiP, bottom-right) and that canvas is
 * what gets recorded — so the camera is baked into the final video.
 */
export function useCaptureController() {
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [settings, setSettings] = useState<CaptureSettings>({
    mic: true,
    camera: false,
    cameraShape: "rounded",
  });
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const phaseRef = useRef<CapturePhase>("idle");
  const displayRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");

  // Compositing (camera-on path).
  const compRafRef = useRef<number>(0);
  const compVideosRef = useRef<HTMLVideoElement[]>([]);

  // Timing across pauses.
  const startedAtRef = useRef(0);
  const accumMsRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const stopTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);
  const startTick = useCallback(() => {
    stopTick();
    tickRef.current = setInterval(() => {
      setElapsedSec(
        (accumMsRef.current + (performance.now() - startedAtRef.current)) / 1000,
      );
    }, 200);
  }, [stopTick]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cleanupStreams = useCallback(() => {
    for (const r of [displayRef, micRef, cameraRef]) {
      r.current?.getTracks().forEach((t) => t.stop());
      r.current = null;
    }
    compVideosRef.current.forEach((v) => {
      v.srcObject = null;
    });
    compVideosRef.current = [];
    cancelAnimationFrame(compRafRef.current);
    setDisplayStream(null);
    setCameraStream(null);
  }, []);

  const finalize = useCallback(() => {
    stopTick();
    cancelAnimationFrame(compRafRef.current);
    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    const url = URL.createObjectURL(blob);
    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    lastUrlRef.current = url;
    setRecording({
      blob,
      url,
      mimeType: mimeRef.current,
      durationSec: accumMsRef.current / 1000,
    });
    setPhase("stopped");
    cleanupStreams();
  }, [cleanupStreams, stopTick]);

  const beginRecording = useCallback(() => {
    // Idempotency guard: never start a second recorder over a live one.
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    const mimeType = pickSupportedMimeType();
    const display = displayRef.current;
    const hasLiveVideo =
      !!display && display.getVideoTracks().some((t) => t.readyState === "live");
    if (!mimeType) {
      setError("This browser can't record video (no supported codec).");
      setPhase("idle");
      cleanupStreams();
      return;
    }
    if (!display || !hasLiveVideo) {
      setError("The screen share ended before recording started. Please try again.");
      setPhase("idle");
      cleanupStreams();
      return;
    }
    mimeRef.current = mimeType;
    chunksRef.current = [];

    let recordStream: MediaStream;
    const micTracks = micRef.current?.getAudioTracks() ?? [];

    if (settings.camera && cameraRef.current) {
      const track = display.getVideoTracks()[0];
      const s = track.getSettings();
      const srcW = s.width ?? 1280;
      const srcH = s.height ?? 720;
      // Cap composite resolution to bound memory on large/Retina captures.
      const cscale = Math.min(1, 1920 / srcW);
      const W = Math.round(srcW * cscale);
      const H = Math.round(srcH * cscale);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      const dv = document.createElement("video");
      dv.srcObject = display;
      dv.muted = true;
      dv.playsInline = true;
      void dv.play();
      const cv = document.createElement("video");
      cv.srcObject = cameraRef.current;
      cv.muted = true;
      cv.playsInline = true;
      void cv.play();
      compVideosRef.current = [dv, cv];

      const shape = settings.cameraShape;
      const clipPath = (ctx2: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
        if (shape === "circle") {
          ctx2.beginPath();
          ctx2.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        } else if (shape === "square") {
          ctx2.beginPath();
          ctx2.rect(x, y, w, h);
        } else {
          roundRectPath(ctx2, x, y, w, h, Math.min(w, h) * 0.12);
        }
      };

      const draw = () => {
        if (dv.videoWidth) ctx.drawImage(dv, 0, 0, W, H);
        if (cv.videoWidth) {
          const square = shape === "circle" || shape === "square";
          const cw = W * PIP_WIDTH_PCT;
          const ch = square ? cw : cw * (cv.videoHeight / cv.videoWidth || 0.75);
          const m = W * PIP_MARGIN_PCT;
          const x = W - cw - m;
          const y = H - ch - m;
          // Cover-crop the camera into a square for circle/square shapes.
          let sx = 0, sy = 0, sw = cv.videoWidth, sh = cv.videoHeight;
          if (square) {
            const side = Math.min(cv.videoWidth, cv.videoHeight);
            sx = (cv.videoWidth - side) / 2;
            sy = (cv.videoHeight - side) / 2;
            sw = side;
            sh = side;
          }
          ctx.save();
          clipPath(ctx, x, y, cw, ch);
          ctx.clip();
          ctx.drawImage(cv, sx, sy, sw, sh, x, y, cw, ch);
          ctx.restore();
          ctx.lineWidth = Math.max(2, W * 0.002);
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          clipPath(ctx, x, y, cw, ch);
          ctx.stroke();
        }
        compRafRef.current = requestAnimationFrame(draw);
      };
      compRafRef.current = requestAnimationFrame(draw);

      const cs = canvas.captureStream(30);
      recordStream = new MediaStream([...cs.getVideoTracks(), ...micTracks]);
    } else {
      recordStream = new MediaStream([
        ...display.getVideoTracks(),
        ...micTracks,
      ]);
    }

    const recorder = new MediaRecorder(recordStream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = finalize;

    accumMsRef.current = 0;
    startedAtRef.current = performance.now();
    setElapsedSec(0);
    startTick();
    recorder.start(1000);
    setPhase("recording");
  }, [settings.camera, settings.cameraShape, finalize, startTick, cleanupStreams]);

  const stopOrCancelRef = useRef<() => void>(() => {});

  const setup = useCallback(async () => {
    setError(null);
    if (!isSupported()) {
      setError("Screen recording is not supported in this browser.");
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      displayRef.current = display;
      setDisplayStream(display);
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopOrCancelRef.current();
      });

      if (settings.mic) {
        try {
          micRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch {
          micRef.current = null;
        }
      }
      if (settings.camera) {
        try {
          const cam = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false,
          });
          cameraRef.current = cam;
          setCameraStream(cam);
        } catch {
          cameraRef.current = null;
        }
      }
      setPhase("ready");
    } catch {
      setError("Screen capture was cancelled or denied.");
    }
  }, [settings]);

  const arm = useCallback(() => {
    // No side effects inside a setState updater — StrictMode double-invokes
    // updaters and would spawn two countdown timers (→ two recorders).
    if (phaseRef.current !== "ready") return;
    if (cdRef.current) clearInterval(cdRef.current);
    setError(null);
    setPhase("countdown");
    setCountdown(COUNTDOWN_FROM);
    let n = COUNTDOWN_FROM;
    cdRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (cdRef.current) clearInterval(cdRef.current);
        cdRef.current = null;
        setCountdown(0);
        beginRecording();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, [beginRecording]);

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === "recording") {
      r.pause();
      accumMsRef.current += performance.now() - startedAtRef.current;
      stopTick();
      setPhase("paused");
    }
  }, [stopTick]);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === "paused") {
      r.resume();
      startedAtRef.current = performance.now();
      startTick();
      setPhase("recording");
    }
  }, [startTick]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      if (r.state === "recording") {
        accumMsRef.current += performance.now() - startedAtRef.current;
      }
      r.stop(); // fires finalize
    }
  }, []);

  const cancel = useCallback(() => {
    if (cdRef.current) clearInterval(cdRef.current);
    cdRef.current = null;
    cleanupStreams();
    setCountdown(0);
    setPhase("idle");
  }, [cleanupStreams]);

  const reset = useCallback(() => {
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
    setRecording(null);
    setPhase("idle");
  }, []);

  // Resolve the "user hit the browser's Stop sharing" case against live phase.
  useEffect(() => {
    stopOrCancelRef.current = () => {
      if (phase === "recording" || phase === "paused") stop();
      else cancel();
    };
  }, [phase, stop, cancel]);

  useEffect(() => {
    return () => {
      stopTick();
      if (cdRef.current) clearInterval(cdRef.current);
      cleanupStreams();
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, [cleanupStreams, stopTick]);

  return {
    phase,
    settings,
    setSettings,
    recording,
    error,
    supported: isSupported(),
    elapsedSec,
    countdown,
    displayStream,
    cameraStream,
    setup,
    arm,
    pause,
    resume,
    stop,
    cancel,
    reset,
  };
}
