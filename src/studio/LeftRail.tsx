import { useEffect, useRef, useState, type ReactNode } from "react";
import "./LeftRail.css";

const PANEL_MIN = 240;
const PANEL_MAX = 620;
const PANEL_DEFAULT = 320;

export type RailTab = {
  id: string;
  icon: ReactNode;
  label: string;
  content: ReactNode;
};

/**
 * DAW-style side rail: an always-visible icon strip plus an expandable panel.
 * Ported from KindleWood's audio editor LeftRail pattern (reimplemented in
 * plain CSS for this standalone repo).
 */
export function LeftRail({
  tabs,
  activeId,
  onChange,
}: {
  tabs: RailTab[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = tabs.find((t) => t.id === activeId) ?? null;

  // Draggable panel width (the vertical separator between the panel and the
  // center stage). Persists while the app is open.
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onResizeDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, d.startW + (e.clientX - d.startX)));
    setWidth(next);
  };
  const onResizeUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      onChange(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onChange]);

  return (
    <div className="rail">
      <div className="rail__strip">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              className={`rail__icon${isActive ? " is-active" : ""}`}
              onClick={() => onChange(isActive ? null : t.id)}
              title={t.label}
              aria-label={t.label}
              aria-pressed={isActive}
            >
              {isActive && <span className="rail__accent" aria-hidden />}
              {t.icon}
            </button>
          );
        })}
      </div>
      {active && (
        <div className="rail__panel" style={{ width }}>
          <div className="rail__panel-head">
            <h3>{active.label}</h3>
            <button
              className="rail__close"
              onClick={() => onChange(null)}
              aria-label={`Close ${active.label}`}
            >
              ✕
            </button>
          </div>
          <div className="rail__panel-body">{active.content}</div>
          <div
            className="rail__resize"
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize panel (double-click to reset)"
            title="Drag to resize · double-click to reset"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onDoubleClick={() => setWidth(PANEL_DEFAULT)}
          />
        </div>
      )}
    </div>
  );
}
