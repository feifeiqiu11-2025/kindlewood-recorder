/**
 * Camera "touch up" beautify levels.
 *
 * Maps each user-facing level to the numeric knobs the WebGL bilateral smoother
 * reads (see [cameraSmoother.ts]). This is the single source of truth shared by
 * the live preview and the recording compositor, so what you see is what gets
 * baked into the export.
 *
 * The effect is edge-preserving: skin softens, but eyes/hair/edges stay sharp.
 * "Glow" pushes the smoothing and lift a little further than "Natural".
 */

import type { SmoothParams } from "./cameraSmoother";

export type Beautify = "off" | "natural" | "glow";

/** Selectable levels, in UI order. */
export const BEAUTIFY_LEVELS: Beautify[] = ["off", "natural", "glow"];

export const BEAUTIFY_LABELS: Record<Beautify, string> = {
  off: "Off",
  natural: "Natural",
  glow: "Glow",
};

const BEAUTIFY_PARAMS: Record<Beautify, SmoothParams> = {
  off: { amount: 0, spread: 1, sigmaColor: 0.15, brightness: 1.0, saturation: 1.0, contrast: 1.0 },
  natural: { amount: 0.7, spread: 2.5, sigmaColor: 0.18, brightness: 1.04, saturation: 1.06, contrast: 1.0 },
  glow: { amount: 0.92, spread: 3.5, sigmaColor: 0.24, brightness: 1.07, saturation: 1.12, contrast: 0.98 },
};

export const beautifyParams = (level: Beautify): SmoothParams => BEAUTIFY_PARAMS[level];
