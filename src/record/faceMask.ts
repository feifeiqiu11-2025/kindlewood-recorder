/**
 * MediaPipe face mask for skin-targeted beautify.
 *
 * Runs FaceLandmarker on the webcam and paints a soft grayscale mask: white over
 * face skin, black over eyes / eyebrows / lips and everything off-face. The
 * smoother multiplies its strength by this mask, so skin softens while eyes,
 * lips, hair, and background stay perfectly sharp — exactly what a plain
 * bilateral filter can't do on its own.
 *
 * The WASM runtime + ~3.7MB model are dynamically imported and only fetched when
 * beautify is actually switched on (mirroring the ffmpeg.wasm lazy load). If
 * anything fails to load, `create()` returns null and callers fall back to
 * full-frame smoothing.
 */
import type { NormalizedLandmark, FaceLandmarker } from "@mediapipe/tasks-vision";
import { FrameClock, getVisionFileset } from "./mediapipe";

/** A landmark-index edge, as returned by MediaPipe's connection tables. */
type Connection = { start: number; end: number };

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Re-detect at ~16fps; the mask is reused between detections (faces move slowly).
const DETECT_INTERVAL_MS = 60;

/** Walk a connection list into an ordered ring of landmark indices. */
function ring(connections: Connection[]): number[] {
  const next = new Map<number, number>();
  for (const c of connections) next.set(c.start, c.end);
  const start = connections[0].start;
  const out = [start];
  let cur = next.get(start);
  let guard = 0;
  while (cur !== undefined && cur !== start && guard++ < 2000) {
    out.push(cur);
    cur = next.get(cur);
  }
  return out;
}

export class FaceMasker {
  /** Grayscale mask (white = smooth here), matches the source video size. */
  readonly maskCanvas: HTMLCanvasElement;
  /** True once a face has been found and the mask is meaningful. */
  hasFace = false;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly landmarker: FaceLandmarker;
  private readonly oval: number[];
  private readonly holes: number[][];
  private readonly clock = new FrameClock(DETECT_INTERVAL_MS);

  private constructor(landmarker: FaceLandmarker, oval: number[], holes: number[][]) {
    this.landmarker = landmarker;
    this.oval = oval;
    this.holes = holes;
    this.maskCanvas = document.createElement("canvas");
    this.ctx = this.maskCanvas.getContext("2d")!;
  }

  /** Load MediaPipe and build a masker, or null if unavailable. */
  static async create(): Promise<FaceMasker | null> {
    try {
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await getVisionFileset();
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      const holes = [
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
      ].map(ring);
      return new FaceMasker(landmarker, ring(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL), holes);
    } catch (e) {
      console.warn("FaceMasker failed to load — falling back to full-frame smoothing.", e);
      return null;
    }
  }

  /** Detect (throttled) and repaint the mask for the current frame. */
  update(video: HTMLVideoElement, tsMs: number): void {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const ts = this.clock.tick(tsMs);
    if (ts === null) return;

    let landmarks: readonly NormalizedLandmark[] | undefined;
    try {
      landmarks = this.landmarker.detectForVideo(video, ts).faceLandmarks?.[0];
    } catch {
      return;
    }
    if (!landmarks?.length) {
      this.hasFace = false;
      return;
    }
    this.paint(landmarks, w, h);
    this.hasFace = true;
  }

  private paint(lms: readonly NormalizedLandmark[], w: number, h: number): void {
    const c = this.maskCanvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.ctx;
    const feather = Math.max(4, h * 0.012);

    ctx.filter = "none";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // Soft edges so smoothing fades in/out rather than showing a hard seam.
    ctx.filter = `blur(${feather}px)`;
    ctx.fillStyle = "#fff";
    this.trace(this.oval, lms, w, h);
    ctx.fill();
    ctx.fillStyle = "#000";
    for (const hole of this.holes) {
      this.trace(hole, lms, w, h);
      ctx.fill();
    }
    ctx.filter = "none";
  }

  private trace(indices: number[], lms: readonly NormalizedLandmark[], w: number, h: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    indices.forEach((idx, i) => {
      const p = lms[idx];
      const x = p.x * w;
      const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  dispose(): void {
    try {
      this.landmarker.close();
    } catch {
      /* already closed */
    }
  }
}
