export type Aspect = "16:9" | "9:16" | "1:1";

export const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];

/** CSS aspect-ratio value for the preview stage. */
export const aspectCss = (a: Aspect): string =>
  a === "16:9" ? "16 / 9" : a === "9:16" ? "9 / 16" : "1 / 1";

/** Output pixel dimensions for export at a given ratio (1080p class). */
export const aspectDims = (a: Aspect): { w: number; h: number } =>
  a === "16:9"
    ? { w: 1920, h: 1080 }
    : a === "9:16"
      ? { w: 1080, h: 1920 }
      : { w: 1080, h: 1080 };
