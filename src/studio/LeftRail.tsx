import { useEffect, type ReactNode } from "react";
import "./LeftRail.css";

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
        <div className="rail__panel">
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
        </div>
      )}
    </div>
  );
}
