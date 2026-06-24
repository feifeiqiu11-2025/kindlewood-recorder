/**
 * Virtual background via MediaPipe selfie segmentation.
 *
 * Segments the person from the background, then composites a treated background
 * — a blurred copy of the frame, or a replacement image — with the (already
 * skin-smoothed) person drawn sharp on top. The person mask is scaled up with
 * smoothing so edges feather naturally.
 *
 * Lazy-loaded like the face masker; if the segmenter can't load or no person is
 * found, `render` passes the frame through untouched so the camera still works.
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { FrameClock, getVisionFileset } from "./mediapipe";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

// Re-segment at ~16fps; the mask is reused between runs.
const SEGMENT_INTERVAL_MS = 60;

export type BackgroundMode = "blur" | "image";

/** Cover-fit an image into w×h, centred. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const ir = img.naturalWidth / img.naturalHeight;
  const r = w / h;
  const dw = ir > r ? h * ir : w;
  const dh = ir > r ? h : w / ir;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export class BackgroundFx {
  /** Final composited frame, matches the source video size. */
  readonly canvas: HTMLCanvasElement;
  /** True once a person mask has been produced. */
  hasMask = false;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly mctx: CanvasRenderingContext2D;
  private readonly personCanvas: HTMLCanvasElement;
  private readonly pctx: CanvasRenderingContext2D;
  private readonly segmenter: ImageSegmenter;
  private readonly bgImg: HTMLImageElement;
  private readonly clock = new FrameClock(SEGMENT_INTERVAL_MS);
  private maskData: ImageData | null = null;
  private bgUrl = "";

  private constructor(segmenter: ImageSegmenter) {
    this.segmenter = segmenter;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.maskCanvas = document.createElement("canvas");
    this.mctx = this.maskCanvas.getContext("2d")!;
    this.personCanvas = document.createElement("canvas");
    this.pctx = this.personCanvas.getContext("2d")!;
    this.bgImg = new Image();
    this.bgImg.crossOrigin = "anonymous";
  }

  static async create(): Promise<BackgroundFx | null> {
    try {
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await getVisionFileset();
      const segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      return new BackgroundFx(segmenter);
    } catch (e) {
      console.warn("BackgroundFx failed to load — background effect disabled.", e);
      return null;
    }
  }

  /** Run segmentation (throttled) and repaint the person mask. */
  update(video: HTMLVideoElement, tsMs: number): void {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const ts = this.clock.tick(tsMs);
    if (ts === null) return;

    try {
      const result = this.segmenter.segmentForVideo(video, ts);
      const mask = result.confidenceMasks?.[0];
      if (mask) {
        const mw = mask.width;
        const mh = mask.height;
        const data = mask.getAsFloat32Array();
        if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
          this.maskCanvas.width = mw;
          this.maskCanvas.height = mh;
        }
        // Reuse one ImageData buffer to avoid per-frame allocation.
        if (!this.maskData || this.maskData.width !== mw || this.maskData.height !== mh) {
          this.maskData = this.mctx.createImageData(mw, mh);
        }
        const px = this.maskData.data;
        for (let i = 0; i < data.length; i++) {
          const j = i * 4;
          px[j] = 255;
          px[j + 1] = 255;
          px[j + 2] = 255;
          px[j + 3] = data[i] * 255; // foreground (person) confidence → alpha
        }
        this.mctx.putImageData(this.maskData, 0, 0);
        this.hasMask = true;
      }
      result.close();
    } catch {
      /* keep last mask on a transient failure */
    }
  }

  /**
   * Composite `person` over a treated background into `canvas`. Falls back to
   * drawing `person` as-is until a mask is available.
   */
  render(
    person: CanvasImageSource,
    video: HTMLVideoElement,
    mode: BackgroundMode,
    bgUrl: string | null,
  ): void {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.filter = "none";
    ctx.clearRect(0, 0, w, h);

    if (!this.hasMask) {
      ctx.drawImage(person, 0, 0, w, h);
      return;
    }

    // 1) Paint the background.
    if (mode === "image") {
      if (bgUrl !== this.bgUrl) {
        this.bgUrl = bgUrl ?? "";
        this.bgImg.src = bgUrl ?? "";
      }
      if (!bgUrl || !this.bgImg.complete || !this.bgImg.naturalWidth) {
        ctx.drawImage(person, 0, 0, w, h); // no/loading image → clean passthrough
        return;
      }
      drawCover(ctx, this.bgImg, w, h);
    } else {
      ctx.filter = `blur(${Math.max(4, w * 0.018)}px)`;
      ctx.drawImage(person, 0, 0, w, h);
      ctx.filter = "none";
    }

    // 2) Cut the person out with the mask and lay them on top, sharp.
    if (this.personCanvas.width !== w || this.personCanvas.height !== h) {
      this.personCanvas.width = w;
      this.personCanvas.height = h;
    }
    const pctx = this.pctx;
    pctx.globalCompositeOperation = "source-over";
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(person, 0, 0, w, h);
    pctx.globalCompositeOperation = "destination-in";
    pctx.drawImage(this.maskCanvas, 0, 0, w, h); // scaled up → feathered edges
    pctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.personCanvas, 0, 0, w, h);
  }

  dispose(): void {
    try {
      this.segmenter.close();
    } catch {
      /* already closed */
    }
  }
}
