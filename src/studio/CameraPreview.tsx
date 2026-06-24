import { useEffect, useRef } from "react";
import { CameraPipeline, type PipelineSettings } from "../record/cameraPipeline";

/**
 * Live webcam view with the beautify + background pipeline applied, so the
 * preview matches what gets recorded. Runs the shared {@link CameraPipeline} and
 * blits its output to a 2D canvas each frame.
 *
 * `className` lets the same component serve as a corner PiP or a centred
 * self-view; it's applied verbatim to the canvas.
 */
export function CameraPreview({
  stream,
  className,
  beautify,
  background,
  backgroundImage,
}: {
  stream: MediaStream;
  className: string;
} & PipelineSettings) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Mirror live settings into a ref so the rAF loop reads them without re-subscribing.
  const settingsRef = useRef<PipelineSettings>({ beautify, background, backgroundImage });

  useEffect(() => {
    settingsRef.current = { beautify, background, backgroundImage };
  }, [beautify, background, backgroundImage]);

  // Hidden source video bound to the camera stream (re-created if it changes).
  useEffect(() => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    void v.play();
    videoRef.current = v;
    return () => {
      v.srcObject = null;
      videoRef.current = null;
    };
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pipeline = new CameraPipeline();

    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && v.videoWidth) {
        const frame = pipeline.render(v, settingsRef.current);
        if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
        }
        ctx.drawImage(frame, 0, 0);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      pipeline.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
