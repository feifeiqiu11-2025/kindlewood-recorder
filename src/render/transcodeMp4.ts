import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
// Bundle the core locally (Vite copies these to /assets) so it loads from our
// own origin — no CDN dependency, works offline and on static hosts, and the
// core version always matches what's installed.
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

/**
 * Transcode a WebM (VP9/Opus) blob to MP4 (H.264/AAC) in the browser via
 * ffmpeg.wasm. Needed because MediaRecorder can't emit H.264+AAC reliably, and
 * platforms like X and CapCut don't accept WebM. Single-threaded core, so no
 * SharedArrayBuffer / COOP-COEP headers are required.
 */

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<boolean> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!loadPromise) loadPromise = ffmpeg.load({ coreURL, wasmURL });
  await loadPromise;
  return ffmpeg;
}

export type TranscodeOptions = {
  /** Conversion progress, 0..1. */
  onProgress?: (fraction: number) => void;
};

export async function transcodeToMp4(
  webm: Blob,
  opts: TranscodeOptions = {},
): Promise<Blob> {
  const ff = await getFFmpeg();

  const logs: string[] = [];
  const onLog = (e: { message: string }) => {
    logs.push(e.message);
    if (logs.length > 40) logs.shift();
  };
  const onProgress = (e: { progress: number }) =>
    opts.onProgress?.(Math.max(0, Math.min(1, e.progress)));
  ff.on("log", onLog);
  ff.on("progress", onProgress);

  try {
    await ff.writeFile("in.webm", await fetchFile(webm));
    const code = await ff.exec([
      "-i", "in.webm",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p", // broad player/social compatibility
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart", // web-friendly: moov atom at the front
      "out.mp4",
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg exited ${code}: ${logs.slice(-3).join(" | ")}`);
    }
    const data = (await ff.readFile("out.mp4")) as Uint8Array;
    if (!data || data.length === 0) {
      throw new Error(`ffmpeg produced no output: ${logs.slice(-3).join(" | ")}`);
    }
    // Copy into a fresh ArrayBuffer-backed view (readFile may hand back a
    // SharedArrayBuffer-backed array, which isn't a valid BlobPart type).
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProgress);
    try {
      await ff.deleteFile("in.webm");
      await ff.deleteFile("out.mp4");
    } catch {
      // best-effort cleanup
    }
  }
}
