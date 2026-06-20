# KindleWood Recorder — Design Doc

A minimal, browser-based screen recorder with manual click-to-zoom editing.
Think "Descript / Screen Studio, but simple and web-only." Standalone project —
publishable on its own, and embeddable into KindleWood Studio later.

Status: **v1 design approved, scaffolding in progress.**

---

## Goals

- Record a screen / window / browser tab in the browser (no install).
- Optional microphone audio.
- Edit: trim start/end, and add **manual zoom blocks** — pin a focus point and a
  zoom level over a time window; smooth eased zoom in/out.
- Export a finished MP4/WebM (download in v1).
- Ship as its own repo. KindleWood can consume the output later via a simple contract.

## Non-Goals (explicitly cut from v1)

- **Automatic** zoom-on-click. Requires OS-level global mouse hooks (native app).
  Out of scope; manual zoom blocks replace it.
- Webcam picture-in-picture overlay → **v2** (additive overlay, easy to add later).
- Multi-clip timeline, transitions, captions, cursor smoothing, background padding.
- Server-side render pipeline → only if canvas export quality proves insufficient.

---

## Why browser-only

The browser's `getDisplayMedia()` captures pixels of any screen/window/tab,
including desktop apps. What the browser **cannot** do is read mouse-click
coordinates outside its own tab (OS sandbox) — that is the only reason
auto-zoom-on-click needs a native app. By making zoom **manual** (pin a spot in
the editor), we remove the only hard dependency and stay 100% in the browser.

| Capability | Own tab | Any window / full screen |
|---|---|---|
| Record video (pixels) | Yes | Yes |
| Auto-zoom on click | Yes | No (needs native) — **cut** |
| Manual zoom block | Yes | Yes — **our approach** |

---

## Core concept: zoom is a transform

The whole differentiator reduces to one idea:

> A **zoom block** = `{ startSec, endSec, focusX, focusY, scale }`.
> It is a clip on a timeline track. During preview and export, each video frame
> is drawn to a `<canvas>` with a scale + translate centered on `(focusX, focusY)`,
> eased in at `startSec` and eased out toward `endSec`.

Everything else (capture, trim, mic) is standard browser media APIs. The zoom
renderer is the only genuinely new code.

---

## Architecture

```
src/
├─ record/        # capture: getDisplayMedia + optional getUserMedia, MediaRecorder → raw blob
├─ editor/        # timeline UI (ported), zoom-block track, focus-point picker, preview <canvas>
├─ render/        # frame-by-frame zoom renderer; canvas → MediaRecorder export
└─ types/         # VideoLayers / ZoomBlock Zod schemas (the portable edit manifest)
```

Data flow: **record → raw blob + `VideoProject` manifest → editor mutates manifest
→ render walks manifest to produce final video.** The manifest is the portable
artifact KindleWood can later import.

### Tech stack

- **Vite + React 19 + TypeScript** — single-page tool, no SSR needed.
- **Zod** — manifest validation (mirrors KindleWood's `layers.types.ts` style).
- Browser media APIs: `getDisplayMedia`, `getUserMedia`, `MediaRecorder`,
  `<canvas>` 2D, `requestVideoFrameCallback`.
- (Later, if needed) `ffmpeg.wasm` for higher-quality export.

---

## Reused from KindleWood (ported, not imported)

Reimplemented here so this repo stays independently shippable — no shared package,
no coupling. Source references in the KindleWood codebase:

| Ported piece | KindleWood source (reference only) |
|---|---|
| Timeline clip track (drag / trim / 0.1s snap) | `components/audio/SFXTimeline.tsx` |
| Track row + ruler layout | `components/audio/TimelineLayout.tsx` |
| Trim region interaction | `components/audio/WaveformTrimmer.tsx` |
| Mix-time / source-offset math | `lib/audio/segment-time.ts` |
| Versioned Zod layers schema pattern | `lib/audio/layers.types.ts` |
| Upload + encode pipeline shape (later) | `lib/audio/upload-recording.service.ts`, `mix.service.ts` |

**The existing KindleWood codebase is not modified.** We only read it as reference.

---

## The edit manifest (v1 shape)

```ts
type ZoomBlock = {
  id: string;
  startSec: number;
  endSec: number;
  focusX: number;   // 0..1, fraction of frame width
  focusY: number;   // 0..1, fraction of frame height
  scale: number;    // e.g. 1.5–2.5
  easeSec: number;  // ramp in/out duration
};

type VideoProject = {
  version: 1;
  sourceDurationSec: number;
  trim: { startSec: number; endSec: number };
  zooms: ZoomBlock[];
  audio: { muted: boolean };   // mic baked into the recording in v1
};
```

---

## Build plan (phased, each shippable)

1. **Capture** — source picker, optional mic, record → raw blob, download. Proves the foundation.
2. **Trim + preview** — port timeline, play raw recording, trim start/end.
3. **Zoom blocks** — add/drag/resize blocks, pin focus on preview, eased zoom in preview. The differentiator.
4. **Export** — canvas re-render → `MediaRecorder` → MP4/WebM download.
5. **Audio polish** — surface mic track; optional SFX overlay (port from KindleWood).

## Future (post-v1)

- Webcam PiP overlay.
- Drop-into-KindleWood: upload the final video + manifest via a small import contract.
- Server FFmpeg render for higher fidelity / larger files.
- Optional native click-helper to re-enable *automatic* zoom across desktop apps.

---

## Open questions

- Export container: WebM is native to `MediaRecorder`; MP4 may need `ffmpeg.wasm`.
  v1 ships whatever `MediaRecorder` supports; revisit if MP4 is required.
- Max recording length before memory pressure (chunked recording handles this).
