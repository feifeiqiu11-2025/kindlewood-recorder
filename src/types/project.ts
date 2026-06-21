import { z } from "zod";

/**
 * The portable edit manifest for KindleWood Recorder.
 *
 * Design: a project is a raw recording plus a small, versioned description of
 * non-destructive edits (trim + zoom blocks). Rendering walks this manifest to
 * produce the final video. This is also the artifact KindleWood Studio can later
 * import. Schema style mirrors KindleWood's `lib/audio/layers.types.ts`.
 */

/**
 * A zoom block: an eased zoom toward a focus point over a time window.
 * Conceptually a clip on a timeline track.
 */
export const ZoomBlockSchema = z.object({
  id: z.string(),
  /** Start of the zoom window, in SOURCE seconds (same clock as the raw recording). */
  startSec: z.number().min(0),
  /** End of the zoom window, in source seconds. Must be > startSec. */
  endSec: z.number().min(0),
  /** Focus point X as a fraction of frame width (0..1). */
  focusX: z.number().min(0).max(1),
  /** Focus point Y as a fraction of frame height (0..1). */
  focusY: z.number().min(0).max(1),
  /** Zoom magnification, e.g. 1.5–2.5. 1 = no zoom. */
  scale: z.number().min(1).max(5),
  /** Ease in/out ramp duration, in seconds. */
  easeSec: z.number().min(0).default(0.4),
});

export type ZoomBlock = z.infer<typeof ZoomBlockSchema>;

export const VideoProjectSchema = z.object({
  version: z.literal(1),
  /** Duration of the raw source recording, in seconds. */
  sourceDurationSec: z.number().min(0),
  /** Trim window applied to the source. */
  trim: z.object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
  }),
  /** Manual zoom blocks, in timeline order. */
  zooms: z.array(ZoomBlockSchema).default([]),
  /** Audio settings. In v1 the mic track is baked into the recording. */
  audio: z.object({
    muted: z.boolean().default(false),
  }),
});

export type VideoProject = z.infer<typeof VideoProjectSchema>;

/** A fresh project covering the full untrimmed source with no zooms. */
export function emptyProject(sourceDurationSec: number): VideoProject {
  return {
    version: 1,
    sourceDurationSec,
    trim: { startSec: 0, endSec: sourceDurationSec },
    zooms: [],
    audio: { muted: false },
  };
}
