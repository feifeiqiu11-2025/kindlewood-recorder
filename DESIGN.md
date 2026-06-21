# KindleWood Recorder — Design

A minimal, browser-based screen recorder with click-to-zoom editing.
Think "Screen Studio / Descript, but simple and web-only." Standalone project —
publishable on its own, and embeddable into KindleWood Studio later.

Status: **working v1.**

---

## Goals

- Record a screen / window / browser tab in the browser (no install), with
  optional microphone and webcam overlay.
- Edit on a **ripple timeline**: split, delete (gaps close), trim.
- Add **manual zoom effects** by placing a target box over the preview.
- Pick an output aspect ratio (16:9 / 9:16 / 1:1) and export a finished video.
- Ship as its own repo; KindleWood can consume the output later via a simple contract.

## Non-goals (deliberately out of scope)

- **Automatic** zoom-on-click. Reading global mouse clicks outside the tab needs
  OS-level hooks (a native app). Manual zoom target boxes replace it.
- Captions, cursor smoothing, transitions, multi-track audio (planned, not v1).
- Server-side rendering. Export is done client-side on a `<canvas>`.

---

## Why browser-only

`getDisplayMedia()` captures pixels of any screen/window/tab, including desktop
apps. What the browser **cannot** do is read mouse-click coordinates outside its
own tab (OS sandbox) — the only reason auto-zoom-on-click usually needs a native
app. Making zoom **manual** removes that hard dependency and keeps us 100% in the
browser.

| Capability | Own tab | Any window / full screen |
|---|---|---|
| Record video (pixels) | Yes | Yes |
| Auto-zoom on click | Yes | No (needs native) — **cut** |
| Manual zoom target | Yes | Yes — **our approach** |

---

## Core concept: zoom is a transform

A **zoom block** = `{ startSec, endSec, focusX, focusY, scale, easeSec }`. During
preview and export, each frame is drawn to a `<canvas>` as a **source crop**: at
scale `s` we sample a region of size `(W/s, H/s)` centered on the focus point and
stretch it to fill the output, eased in/out across the block. The same math runs
for live preview and final export, so what you see is what you get
([render/zoom.ts](src/render/zoom.ts), [render/renderFrame.ts](src/render/renderFrame.ts)).

---

## The ripple timeline

The editor timeline is a **ripple sequence**: kept **segments** play back-to-back.
A segment references a SOURCE range (`sourceStart`/`sourceEnd`); its TIMELINE
position is the cumulative duration of the segments before it. So deleting a clip
closes the gap automatically and the remaining video starts at 0.

- Playback and export map timeline ⇄ source via helpers in
  [types/project.ts](src/types/project.ts) (`timelineToSource`, `sourceToTimeline`,
  `segmentAtSource`).
- Zoom block times are in **timeline** seconds, so they stay aligned to the output.

---

## Architecture

```
src/
├─ record/   # capture state machine + MediaRecorder
│   ├─ recording.ts            # codec negotiation, stream composition, download
│   └─ useCaptureController.ts # idle→ready→countdown→recording⇄paused→stopped; camera PiP compositing
├─ render/   # pure rendering & encoding (framework-agnostic)
│   ├─ zoom.ts                 # eased zoom lookup at a timeline time
│   ├─ renderFrame.ts          # crop-based zoom draw
│   └─ exportVideo.ts          # real-time canvas re-render → MediaRecorder
├─ studio/   # editor UI
│   ├─ Studio.tsx              # workspace composition + editor state
│   ├─ Tracks.tsx              # multi-lane ripple timeline
│   ├─ ActionBar.tsx           # play / split / zoom / volume / delete
│   ├─ ZoomTargetOverlay.tsx   # draggable/resizable zoom target box
│   ├─ FloatingControls.tsx    # Document PiP + in-page fallback
│   ├─ LeftRail.tsx            # icon strip + panels (Sounds/Music/Effects)
│   ├─ aspect.ts / stageGeometry.ts / audio.ts
│   └─ icons.tsx
└─ types/
    └─ project.ts              # VideoProject Zod schema + timeline/source helpers
```

Data flow: **record → raw blob + `VideoProject` manifest → editor mutates manifest
→ export walks manifest to produce the final video.** The manifest is the portable
artifact KindleWood can later import.

### Tech stack

- **Vite + React 19 + TypeScript** — single-page tool, no SSR.
- **Zod** — manifest validation.
- Browser media APIs: `getDisplayMedia`, `getUserMedia`, `MediaRecorder`,
  `<canvas>` 2D, Document Picture-in-Picture.

---

## The edit manifest

```ts
type Segment = { id: string; sourceStart: number; sourceEnd: number };

type ZoomBlock = {
  id: string;
  startSec: number;   // timeline time
  endSec: number;
  focusX: number;     // 0..1 of frame width
  focusY: number;     // 0..1 of frame height
  scale: number;      // 1..5
  easeSec: number;    // ramp in/out
};

type VideoProject = {
  version: 1;
  sourceDurationSec: number;
  segments: Segment[]; // ripple timeline (played in order)
  zooms: ZoomBlock[];
  audio: { muted: boolean; volumeDb: number };
};
```

Output aspect ratio and camera shape are session/UI state, applied at export time
rather than stored on the manifest.

---

## Export

Real-time approach: play the kept segments through once, draw each frame to an
offscreen canvas with the zoom transform (letterboxed into the chosen aspect
ratio), and capture the canvas stream + the source audio via `MediaRecorder`.
Output is 1080p WebM at a healthy bitrate. An **MP4 (H.264 + AAC)** path via
`ffmpeg.wasm` is planned for platforms that don't accept WebM (X, CapCut).

---

## Reused from KindleWood (ported, not imported)

The DAW-style layout pattern (left rail, track rows + ruler, transport bar) is
**reimplemented** here from KindleWood's audio editor so this repo stays
independently shippable — no shared package, no coupling. The existing KindleWood
codebase is not modified; it was only read as reference.

---

## Known trade-offs

- Export is **real-time** (a clip takes ~its own length to render). A server-side
  or WebCodecs path could make it faster than real-time later.
- Output is **WebM** until the ffmpeg.wasm MP4 path lands.
- Camera is **baked** into the recording (composited at capture) rather than a
  separate movable track.
