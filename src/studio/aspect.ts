export type Aspect = "16:9" | "9:16" | "1:1";

export const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];

/** CSS aspect-ratio value for the preview stage. */
export const aspectCss = (a: Aspect): string =>
  a === "16:9" ? "16 / 9" : a === "9:16" ? "9 / 16" : "1 / 1";

/** Output pixel dimensions for export at a given ratio. */
export const aspectDims = (a: Aspect): { w: number; h: number } =>
  a === "16:9"
    ? { w: 1280, h: 720 }
    : a === "9:16"
      ? { w: 720, h: 1280 }
      : { w: 960, h: 960 };
