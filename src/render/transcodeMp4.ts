import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

/**
 * Transcode a WebM (VP9/Opus) blob to MP4 (H.264/AAC) in the browser via
 * ffmpeg.wasm. Needed because MediaRecorder can't emit H.264+AAC reliably, and
 * platforms like X and CapCut don't accept WebM.
 *
 * The ~30 MB ffmpeg core is fetched from a CDN on first use and cached for the
 * session. Uses the single-threaded core, so no SharedArrayBuffer / COOP-COEP
 * headers are required.
 */

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!loadPromise) {
    loadPromise = (async () => {
      await ffmpeg!.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
    })();
  }
  await loadPromise;
  return ffmpeg;
}

export type TranscodeOptions = {
  /** Conversion progress, 0..1 (excludes the one-time core download). */
  onProgress?: (fraction: number) => void;
};

export async function transcodeToMp4(
  webm: Blob,
  opts: TranscodeOptions = {},
): Promise<Blob> {
  const ff = await getFFmpeg();
  const onProgress = (e: { progress: number }) =>
    opts.onProgress?.(Math.max(0, Math.min(1, e.progress)));
  ff.on("progress", onProgress);
  try {
    await ff.writeFile("in.webm", await fetchFile(webm));
    await ff.exec([
      "-i", "in.webm",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "22",
      "-pix_fmt", "yuv420p", // broad player/social compatibility
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart", // web-friendly: moov atom at the front
      "out.mp4",
    ]);
    const data = (await ff.readFile("out.mp4")) as Uint8Array;
    // Copy into a fresh ArrayBuffer-backed view (readFile may return a
    // SharedArrayBuffer-backed array, which isn't a valid BlobPart type).
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ff.off("progress", onProgress);
    try {
      await ff.deleteFile("in.webm");
      await ff.deleteFile("out.mp4");
    } catch {
      // best-effort cleanup
    }
  }
}
