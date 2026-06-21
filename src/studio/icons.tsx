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
