import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CaptureStreams,
  downloadBlob,
  extensionForMimeType,
  pickSupportedMimeType,
  requestCaptureStreams,
  stopStreams,
} from "./recording";

export type RecorderStatus = "idle" | "recording" | "stopped";

export type Recording = {
  blob: Blob;
  url: string;
  mimeType: string;
  /** Best-effort duration in seconds (measured wall-clock while recording). */
  durationSec: number;
};

export type UseScreenRecorder = {
  status: RecorderStatus;
  recording: Recording | null;
  error: string | null;
  /** Whether the browser supports the APIs we need. */
  supported: boolean;
  /** Elapsed seconds during an active recording. */
  elapsedSec: number;
  start: (opts: { includeMic: boolean }) => Promise<void>;
  stop: () => void;
  reset: () => void;
  download: () => void;
};

const isSupported = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  typeof MediaRecorder !== "undefined";

export function useScreenRecorder(): UseScreenRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<CaptureStreams | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Revoke the previous object URL when it is replaced or on unmount.
  const lastUrlRef = useRef<string | null>(null);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stop = useCallback(() => {
    // Stopping the recorder fires onstop, which finalizes the blob.
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    clearTick();
  }, []);

  const start = useCallback(
    async ({ includeMic }: { includeMic: boolean }) => {
      setError(null);
      const mimeType = pickSupportedMimeType();
      if (!isSupported() || !mimeType) {
        setError("Screen recording is not supported in this browser.");
        return;
      }

      let streams: CaptureStreams;
      try {
        streams = await requestCaptureStreams({ includeMic });
      } catch {
        // User dismissed the picker, or permission was denied.
        setError("Screen capture was cancelled or denied.");
        return;
      }

      streamsRef.current = streams;
      chunksRef.current = [];

      const recorder = new MediaRecorder(streams.combined, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        const durationSec = (performance.now() - startedAtRef.current) / 1000;
        setRecording({ blob, url, mimeType, durationSec });
        setStatus("stopped");
        stopStreams(streamsRef.current ?? {});
        streamsRef.current = null;
      };

      // If the user clicks the browser's native "Stop sharing", end cleanly.
      streams.display.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", stop);
      });

      startedAtRef.current = performance.now();
      setElapsedSec(0);
      clearTick();
      tickRef.current = setInterval(() => {
        setElapsedSec((performance.now() - startedAtRef.current) / 1000);
      }, 250);

      recorder.start(1000); // gather chunks every second
      setStatus("recording");
    },
    [stop],
  );

  const reset = useCallback(() => {
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
    setRecording(null);
    setStatus("idle");
    setElapsedSec(0);
    setError(null);
  }, []);

  const download = useCallback(() => {
    if (!recording) return;
    const ext = extensionForMimeType(recording.mimeType);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadBlob(recording.blob, `kindlewood-recording-${stamp}.${ext}`);
  }, [recording]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTick();
      stopStreams(streamsRef.current ?? {});
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  return {
    status,
    recording,
    error,
    supported: isSupported(),
    elapsedSec,
    start,
    stop,
    reset,
    download,
  };
}
