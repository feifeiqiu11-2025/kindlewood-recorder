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

/** A kept slice of the source recording. The final video plays the segments
 *  back-to-back in array order (a ripple timeline): each segment's TIMELINE
 *  position is the cumulative duration of the segments before it, so deleting
 *  one closes the gap automatically. `sourceStart/sourceEnd` reference the raw
 *  recording; zoom block times are in TIMELINE seconds. */
export const SegmentSchema = z.object({
  id: z.string(),
  sourceStart: z.number().min(0),
  sourceEnd: z.number().min(0),
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
    segments: [{ id: crypto.randomUUID(), sourceStart: 0, sourceEnd: sourceDurationSec }],
    zooms: [],
    audio: { muted: false, volumeDb: 0 },
  };
}

const segDur = (s: Segment) => s.sourceEnd - s.sourceStart;

/** Total timeline (output) duration — the segments played back-to-back. */
export function keptDuration(p: VideoProject): number {
  return p.segments.reduce((sum, s) => sum + segDur(s), 0);
}

/** The segment containing a SOURCE time, with its timeline start offset. */
export function segmentAtSource(
  p: VideoProject,
  sourceSec: number,
): { seg: Segment; index: number; tlStart: number } | null {
  let acc = 0;
  for (let i = 0; i < p.segments.length; i++) {
    const s = p.segments[i];
    if (sourceSec >= s.sourceStart - 1e-6 && sourceSec <= s.sourceEnd + 1e-6) {
      return { seg: s, index: i, tlStart: acc };
    }
    acc += segDur(s);
  }
  return null;
}

/** Convert a SOURCE time to TIMELINE time (snaps gaps to the next segment). */
export function sourceToTimeline(p: VideoProject, sourceSec: number): number {
  let acc = 0;
  for (const s of p.segments) {
    if (sourceSec < s.sourceStart) return acc;
    if (sourceSec <= s.sourceEnd) return acc + (sourceSec - s.sourceStart);
    acc += segDur(s);
  }
  return acc;
}

/** Convert a TIMELINE time to a SOURCE time (and the owning segment). */
export function timelineToSource(
  p: VideoProject,
  tlSec: number,
): { sourceTime: number; index: number; tlStart: number } {
  let acc = 0;
  for (let i = 0; i < p.segments.length; i++) {
    const s = p.segments[i];
    const dur = segDur(s);
    if (tlSec <= acc + dur + 1e-6) {
      return { sourceTime: s.sourceStart + Math.max(0, tlSec - acc), index: i, tlStart: acc };
    }
    acc += dur;
  }
  const last = p.segments[p.segments.length - 1];
  return { sourceTime: last.sourceEnd, index: p.segments.length - 1, tlStart: acc - segDur(last) };
}

/** Timeline start offset of a segment by id (or 0). */
export function segmentTimelineStart(p: VideoProject, id: string): number {
  let acc = 0;
  for (const s of p.segments) {
    if (s.id === id) return acc;
    acc += segDur(s);
  }
  return acc;
}
