import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type {
  CameraBackground,
  CameraPosition,
  CameraShape,
  CaptureSettings,
} from "../record/useCaptureController";
import { BEAUTIFY_LEVELS, BEAUTIFY_LABELS } from "../record/cameraFilter";

const SHAPES: CameraShape[] = ["rounded", "circle", "square"];
const BACKGROUNDS: { id: CameraBackground; label: string }[] = [
  { id: "none", label: "Off" },
  { id: "blur", label: "Blur" },
  { id: "image", label: "Image" },
];
// Ordered to fill the 3×2 grid row by row, so each cell maps to its screen spot.
const POSITIONS: { id: CameraPosition; label: string }[] = [
  { id: "tl", label: "Top left" },
  { id: "tc", label: "Top middle" },
  { id: "tr", label: "Top right" },
  { id: "bl", label: "Bottom left" },
  { id: "bc", label: "Bottom middle" },
  { id: "br", label: "Bottom right" },
];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Compact dropdown for the camera's shape, position, touch-up, and background.
 * Keeps the record bar tidy: a single summary button that opens a small popover
 * only when the user wants to change defaults.
 */
export function CameraOptionsMenu({
  settings,
  setSettings,
}: {
  settings: CaptureSettings;
  setSettings: Dispatch<SetStateAction<CaptureSettings>>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSettings((s) => {
      if (s.backgroundImage?.startsWith("blob:")) URL.revokeObjectURL(s.backgroundImage);
      return { ...s, backgroundImage: url, background: "image" };
    });
    e.target.value = ""; // allow re-picking the same file
  };

  return (
    <div className="cam-menu" ref={ref}>
      <button
        type="button"
        className="cam-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span>
          {cap(settings.cameraShape)} · {BEAUTIFY_LABELS[settings.beautify]}
        </span>
        <svg className="cam-menu__chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 3.5 L5 6.5 L8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="cam-menu__panel">
          <div className="cam-menu__row">
            <span className="cam-menu__label">Shape</span>
            <div className="segmented" role="group" aria-label="Camera shape">
              {SHAPES.map((sh) => (
                <button
                  key={sh}
                  className={`segmented__btn${settings.cameraShape === sh ? " is-active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, cameraShape: sh }))}
                  aria-pressed={settings.cameraShape === sh}
                >
                  {cap(sh)}
                </button>
              ))}
            </div>
          </div>

          <div className="cam-menu__row">
            <span className="cam-menu__label">Position</span>
            <div className="cam-corners" role="group" aria-label="Camera position">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  className={`cam-corners__btn${settings.cameraPosition === p.id ? " is-active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, cameraPosition: p.id }))}
                  aria-pressed={settings.cameraPosition === p.id}
                  aria-label={p.label}
                  title={p.label}
                >
                  <span className="cam-corners__dot" />
                </button>
              ))}
            </div>
          </div>

          <div className="cam-menu__row">
            <span className="cam-menu__label">Touch up</span>
            <div className="segmented" role="group" aria-label="Camera touch up">
              {BEAUTIFY_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  className={`segmented__btn${settings.beautify === lvl ? " is-active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, beautify: lvl }))}
                  aria-pressed={settings.beautify === lvl}
                  title="Smooth skin while keeping eyes and details sharp"
                >
                  {BEAUTIFY_LABELS[lvl]}
                </button>
              ))}
            </div>
          </div>

          <div className="cam-menu__row">
            <span className="cam-menu__label">Background</span>
            <div className="segmented" role="group" aria-label="Camera background">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  className={`segmented__btn${settings.background === b.id ? " is-active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, background: b.id }))}
                  aria-pressed={settings.background === b.id}
                  title="Blur or replace what's behind you"
                >
                  {b.label}
                </button>
              ))}
            </div>
            {settings.background === "image" && (
              <div className="cam-menu__upload">
                <button
                  type="button"
                  className="cam-menu__upload-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  {settings.backgroundImage ? "Change image" : "Choose image…"}
                </button>
                {settings.backgroundImage && (
                  <img className="cam-menu__thumb" src={settings.backgroundImage} alt="" />
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
