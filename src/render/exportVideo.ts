import type { VideoProject } from "../types/project";
import { drawFrame } from "./renderFrame";
import { zoomAt } from "./zoom";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Seek a video element and resolve once the seek has landed. */
function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
  });
}

export type ExportOptions = {
  video: HTMLVideoElement;
  project: VideoProject;
  mimeType: string;
  fps?: number;
  onProgress?: (fraction: number) => void;
};

/**
 * Render the trimmed + zoomed result to a new video blob.
 *
 * Real-time approach: play the source through once, draw each frame to an
 * offscreen canvas with the zoom transform, and capture the canvas stream plus
 * the source's audio track via MediaRecorder. Good enough for v1; a server-side
 * FFmpeg path can replace this later if higher fidelity is needed.
 */
export async function exportVideo({
  video,
  project,
  mimeType,
  fps = 30,
  onProgress,
}: ExportOptions): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context for export.");

  // Capture audio from the source recording before we mute it for playback.
  const captureFn = (
    video as HTMLVideoElement & { captureStream?: () => MediaStream }
  ).captureStream;
  const sourceStream = captureFn ? captureFn.call(video) : undefined;
  const audioTracks = sourceStream?.getAudioTracks() ?? [];

  const canvasStream = canvas.captureStream(fps);
  const out = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(project.audio.muted ? [] : audioTracks),
  ]);

  const recorder = new MediaRecorder(out, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const start = project.trim.startSec;
  const end = project.trim.endSec;
  const wasMuted = video.muted;

  await seekTo(video, start);

  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;

    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      video.pause();
      video.muted = wasMuted;
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => reject(new Error("Recording failed during export."));

    const tick = () => {
      const t = video.currentTime;
      drawFrame(ctx, video, zoomAt(project, t));
      onProgress?.(clamp((t - start) / Math.max(0.001, end - start), 0, 1));

      if (t >= end || video.ended) {
        recorder.stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    recorder.start();
    video.muted = true; // avoid playing sound aloud during export
    video
      .play()
      .then(() => {
        raf = requestAnimationFrame(tick);
      })
      .catch(reject);
  });
}
