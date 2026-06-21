import type { VideoProject } from "../types/project";

/** The effective zoom state at a given moment. */
export type ActiveZoom = { scale: number; focusX: number; focusY: number };

const NO_ZOOM: ActiveZoom = { scale: 1, focusX: 0.5, focusY: 0.5 };

/** Smooth ease-in-out so zooms feel natural, not linear. */
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Compute the zoom transform at a given SOURCE time. Walks the zoom blocks,
 * finds the one covering this moment, and ramps the scale in/out across its
 * ease window. Blocks are assumed non-overlapping (enforced in the editor).
 */
export function zoomAt(project: VideoProject, sourceTimeSec: number): ActiveZoom {
  const block = project.zooms.find(
    (b) => sourceTimeSec >= b.startSec && sourceTimeSec <= b.endSec,
  );
  if (!block) return NO_ZOOM;

  const span = block.endSec - block.startSec;
  const ease = Math.min(block.easeSec, span / 2);

  let f = 1;
  if (ease > 0) {
    if (sourceTimeSec < block.startSec + ease) {
      f = easeInOutCubic((sourceTimeSec - block.startSec) / ease);
    } else if (sourceTimeSec > block.endSec - ease) {
      f = easeInOutCubic((block.endSec - sourceTimeSec) / ease);
    }
  }

  return {
    scale: 1 + (block.scale - 1) * f,
    focusX: block.focusX,
    focusY: block.focusY,
  };
}
