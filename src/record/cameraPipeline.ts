/**
 * The camera effect pipeline: skin beautify (WebGL bilateral, face-masked) then
 * virtual background (segmented blur / image). One instance processes a frame
 * and returns the canvas to draw.
 *
 * Both the live preview and the recording compositor drive this same class, so
 * what you see is what gets recorded. Heavy models (face landmarker, segmenter)
 * load lazily the first time their effect is switched on; WebGL is only acquired
 * when beautify is used. Each stage degrades gracefully — a missing model or
 * absent WebGL simply skips that stage rather than failing.
 */
import { CameraSmoother } from "./cameraSmoother";
import { FaceMasker } from "./faceMask";
import { BackgroundFx } from "./cameraBackground";
import { beautifyParams, type Beautify } from "./cameraFilter";
import type { CameraBackground } from "./useCaptureController";

export type PipelineSettings = {
  beautify: Beautify;
  background: CameraBackground;
  backgroundImage: string | null;
};

export class CameraPipeline {
  private smoother: CameraSmoother | null = null;
  private smootherTried = false;
  private masker: FaceMasker | null = null;
  private maskerLoading = false;
  private bgFx: BackgroundFx | null = null;
  private bgLoading = false;
  private disposed = false;

  /**
   * Process one frame and return what to draw — a processed canvas, or the
   * source `video` itself when no effect applies.
   */
  render(video: HTMLVideoElement, s: PipelineSettings): CanvasImageSource {
    const tsMs = performance.now();
    let frame: CanvasImageSource = video;

    if (s.beautify !== "off") {
      if (!this.smootherTried) {
        this.smootherTried = true;
        this.smoother = CameraSmoother.create();
      }
      if (this.smoother) {
        this.ensureMasker();
        if (this.masker) this.masker.update(video, tsMs);
        const skin = this.masker?.hasFace ? this.masker.maskCanvas : null;
        this.smoother.render(video, beautifyParams(s.beautify), skin);
        frame = this.smoother.canvas;
      }
    }

    if (s.background !== "none") {
      this.ensureBg();
      if (this.bgFx) {
        this.bgFx.update(video, tsMs);
        this.bgFx.render(frame, video, s.background === "image" ? "image" : "blur", s.backgroundImage);
        frame = this.bgFx.canvas;
      }
    }

    return frame;
  }

  private ensureMasker(): void {
    if (this.masker || this.maskerLoading) return;
    this.maskerLoading = true;
    void FaceMasker.create().then((m) => {
      this.maskerLoading = false;
      if (this.disposed) m?.dispose();
      else this.masker = m;
    });
  }

  private ensureBg(): void {
    if (this.bgFx || this.bgLoading) return;
    this.bgLoading = true;
    void BackgroundFx.create().then((b) => {
      this.bgLoading = false;
      if (this.disposed) b?.dispose();
      else this.bgFx = b;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.smoother?.dispose();
    this.masker?.dispose();
    this.bgFx?.dispose();
  }
}
