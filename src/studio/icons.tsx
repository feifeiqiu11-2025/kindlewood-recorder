/** Minimal inline icons for the left rail (16px, stroke = currentColor). */

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const SoundsIcon = () => (
  <svg {...base}>
    <path d="M3 10v4h4l5 4V6L7 10H3z" />
    <path d="M16 9a3 3 0 0 1 0 6" />
  </svg>
);

export const MusicIcon = () => (
  <svg {...base}>
    <path d="M9 18V5l10-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </svg>
);

export const ZoomIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
  </svg>
);

export const ScriptIcon = () => (
  <svg {...base}>
    <path d="M4 4h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 1-2z" />
    <path d="M8 8h6M8 12h6" />
  </svg>
);

const sm = { ...base, width: 16, height: 16 };

export const PlayIcon = () => (
  <svg {...sm}>
    <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...sm}>
    <rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" />
  </svg>
);

export const ScissorsIcon = () => (
  <svg {...sm}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
  </svg>
);

export const ZoomOutIcon = () => (
  <svg {...sm}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M8 11h6" />
  </svg>
);

export const ZoomInIcon = () => (
  <svg {...sm}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...sm}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);
