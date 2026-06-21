/**
 * Low-level recording helpers: codec negotiation, stream composition, download.
 * Kept framework-agnostic so the React hook stays thin.
 */

/** Preferred MediaRecorder mime types, best first. */
const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

/** Pick the first mime type MediaRecorder actually supports in this browser. */
export function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/** File extension for a given mime type. */
export function extensionForMimeType(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

export type CaptureOptions = {
  /** Capture microphone audio alongside the screen. */
  includeMic: boolean;
};

export type CaptureStreams = {
  /** Combined stream fed to MediaRecorder (screen video + optional mic audio). */
  combined: MediaStream;
  /** The raw display stream, retained so we can stop its tracks later. */
  display: MediaStream;
  /** The mic stream, if requested. */
  mic: MediaStream | null;
};

/**
 * Request screen capture and (optionally) microphone, returning a combined
 * stream ready for MediaRecorder. Throws if the user cancels the picker.
 */
export async function requestCaptureStreams(
  opts: CaptureOptions,
): Promise<CaptureStreams> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: false,
  });

  let mic: MediaStream | null = null;
  if (opts.includeMic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Mic denied or unavailable — continue screen-only rather than fail hard.
      mic = null;
    }
  }

  const combined = new MediaStream();
  display.getVideoTracks().forEach((t) => combined.addTrack(t));
  mic?.getAudioTracks().forEach((t) => combined.addTrack(t));

  return { combined, display, mic };
}

/** Stop every track across the given streams. */
export function stopStreams(streams: Partial<CaptureStreams>): void {
  streams.combined?.getTracks().forEach((t) => t.stop());
  streams.display?.getTracks().forEach((t) => t.stop());
  streams.mic?.getTracks().forEach((t) => t.stop());
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the object URL alive long enough for large downloads to finish;
  // revoking too early can truncate them in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
