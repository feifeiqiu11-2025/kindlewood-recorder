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

/** A kept slice of the source recording. The final video is the segments
 *  played in order; gaps between them (deleted ranges) are dropped. */
export const SegmentSchema = z.object({
  id: z.string(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
});

export type Segment = z.infer<typeof SegmentSchema>;

export const VideoProjectSchema = z.object({
  version: z.literal(1),
  /** Duration of the raw source recording, in seconds. */
  sourceDurationSec: z.number().min(0),
  /** Kept segments of the source, in source-time order. */
  segments: z.array(SegmentSchema).min(1),
  /** Manual zoom blocks, in timeline order. */
  zooms: z.array(ZoomBlockSchema).default([]),
  /** Audio settings. In v1 the mic track is baked into the recording. */
  audio: z.object({
    muted: z.boolean().default(false),
    /** Playback gain in dB applied to the recording's audio (-30..+6). */
    volumeDb: z.number().min(-30).max(6).default(0),
  }),
});

export type VideoProject = z.infer<typeof VideoProjectSchema>;

/** A fresh project: one segment covering the whole source, no zooms. */
export function emptyProject(sourceDurationSec: number): VideoProject {
  return {
    version: 1,
    sourceDurationSec,
    segments: [{ id: crypto.randomUUID(), startSec: 0, endSec: sourceDurationSec }],
    zooms: [],
    audio: { muted: false, volumeDb: 0 },
  };
}

/** Total kept duration across all segments. */
export function keptDuration(p: VideoProject): number {
  return p.segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
}
