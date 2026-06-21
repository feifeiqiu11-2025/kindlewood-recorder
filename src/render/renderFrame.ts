import type { ActiveZoom } from "./zoom";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Draw one video frame into the canvas applying the zoom transform.
 *
 * Zoom is implemented as a source crop: at scale `s` we sample a region of
 * size (W/s, H/s) centered on the focus point and stretch it to fill the
 * canvas. Identical math is used for live preview and final export, so what
 * you see is what you get.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource & { videoWidth?: number; videoHeight?: number },
  zoom: ActiveZoom,
): void {
  const vw = source.videoWidth ?? ctx.canvas.width;
  const vh = source.videoHeight ?? ctx.canvas.height;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  const sw = vw / zoom.scale;
  const sh = vh / zoom.scale;

  // Center the crop on the focus point, then clamp inside the frame.
  const sx = clamp(zoom.focusX * vw - sw / 2, 0, vw - sw);
  const sy = clamp(zoom.focusY * vh - sh / 2, 0, vh - sh);

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
}
