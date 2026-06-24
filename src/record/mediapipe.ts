/**
 * Shared MediaPipe Tasks-Vision helpers used by the face masker and the
 * background segmenter.
 *
 * Both effects need the same ~1MB WASM runtime; `getVisionFileset()` loads it
 * once and memoizes the promise so enabling both effects doesn't fetch or
 * compile it twice. `FrameClock` centralises the per-effect throttle plus the
 * strictly-increasing-timestamp rule that MediaPipe's `*ForVideo` calls require.
 */
import type { FilesetResolver } from "@mediapipe/tasks-vision";

// Pinned to the installed @mediapipe/tasks-vision version (see package.json).
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

/** Load (once) and return the shared vision WASM fileset. */
export function getVisionFileset() {
  if (!filesetPromise) {
    filesetPromise = import("@mediapipe/tasks-vision").then((m) =>
      m.FilesetResolver.forVisionTasks(WASM_URL),
    );
  }
  return filesetPromise;
}

/**
 * Throttles per-frame detection to a target interval and hands back a
 * monotonically-increasing timestamp for MediaPipe, or null when the frame
 * should be skipped.
 */
export class FrameClock {
  private readonly intervalMs: number;
  private lastTs = 0;
  private lastRun = -1e9;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  /** Returns the timestamp to feed MediaPipe, or null if still within the interval. */
  tick(tsMs: number): number | null {
    if (tsMs - this.lastRun < this.intervalMs) return null;
    const ts = tsMs <= this.lastTs ? this.lastTs + 1 : tsMs;
    this.lastTs = ts;
    this.lastRun = tsMs;
    return ts;
  }
}
