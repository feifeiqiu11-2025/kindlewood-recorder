import { useEffect, useRef, useState } from "react";

/**
 * Auto-scrolling teleprompter surface. Rendered inside the floating presenter
 * window (Document Picture-in-Picture) so it guides the speaker without being
 * part of a tab/window recording. Inline styles only — it lives in a separate
 * document that doesn't share the app stylesheet.
 */

type TeleprompterProps = {
  text: string;
  playing: boolean;
  /** Scroll speed in pixels per second. */
  speed: number;
  fontSize: number;
  /** Bump to reset the scroll back to the top (e.g. on a new take). */
  resetKey: number;
};

const WRAP: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  borderRadius: 10,
  background: "#0c0c12",
};

const CONTENT: React.CSSProperties = {
  padding: "16px 18px 80%",
  color: "#f1f1f7",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontWeight: 600,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  willChange: "transform",
};

const EMPTY: React.CSSProperties = { ...CONTENT, color: "#6b6b85", fontWeight: 500 };

const HOVER_BADGE: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 10,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.6)",
  color: "#ffd84d",
  fontSize: 11,
  fontWeight: 700,
  pointerEvents: "none",
};

const fade = (edge: "top" | "bottom"): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  right: 0,
  [edge]: 0,
  height: 28,
  pointerEvents: "none",
  background: `linear-gradient(${edge === "top" ? "180deg" : "0deg"}, #0c0c12, transparent)`,
});

export function Teleprompter({ text, playing, speed, fontSize, resetKey }: TeleprompterProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  // Hovering the script pauses the scroll so the presenter can read in place.
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // Reset to the top on a new take or when the script changes.
  useEffect(() => {
    posRef.current = 0;
    if (contentRef.current) contentRef.current.style.transform = "translateY(0px)";
  }, [resetKey, text]);

  // Single rAF loop advances the scroll while playing.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = (ts: number) => {
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const wrap = wrapRef.current;
      const content = contentRef.current;
      if (playingRef.current && !hoveredRef.current && wrap && content) {
        const max = Math.max(0, content.scrollHeight - wrap.clientHeight);
        posRef.current = Math.min(max, posRef.current + speedRef.current * dt);
        content.style.transform = `translateY(${-posRef.current}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={wrapRef}
      style={WRAP}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div ref={contentRef} style={text ? { ...CONTENT, fontSize } : { ...EMPTY, fontSize }}>
        {text || "Write your script in the Script tab to use the teleprompter."}
      </div>
      <div style={fade("top")} />
      <div style={fade("bottom")} />
      {hovered && playing && <div style={HOVER_BADGE}>paused — move away to resume</div>}
    </div>
  );
}
