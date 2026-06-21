const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Fractions of the stage that the (letterboxed) video content occupies. */
export function contentFracs(videoAspect: number, stageAspect: number) {
  if (videoAspect >= stageAspect) {
    return { wf: 1, hf: stageAspect / videoAspect };
  }
  return { wf: videoAspect / stageAspect, hf: 1 };
}

/** Map a client point over the stage to a normalized focus in the video frame. */
export function focusFromClient(
  clientX: number,
  clientY: number,
  stageRect: DOMRect,
  videoAspect: number,
  stageAspect: number,
): { focusX: number; focusY: number } {
  const { wf, hf } = contentFracs(videoAspect, stageAspect);
  const leftF = (1 - wf) / 2;
  const topF = (1 - hf) / 2;
  const nx = (clientX - stageRect.left) / stageRect.width;
  const ny = (clientY - stageRect.top) / stageRect.height;
  return {
    focusX: clamp((nx - leftF) / wf, 0, 1),
    focusY: clamp((ny - topF) / hf, 0, 1),
  };
}
