# KindleWood Recorder

A minimal, browser-based **screen recorder with click-to-zoom editing** — record, cut, zoom, and export a finished video without installing anything. Think "Screen Studio / Descript, but simple and 100% in the browser."

[![CI](https://github.com/feifeiqiu11-2025/kindlewood-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/feifeiqiu11-2025/kindlewood-recorder/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> Status: working v1. Records screen + mic + webcam, edits on a ripple timeline with manual zoom effects, and exports 1080p video in the browser.

## Features

- **Screen capture** of any screen, window, or browser tab via `getDisplayMedia`.
- **Recording flow** with explicit Set up → 3·2·1 countdown → Pause/Resume/Stop, plus an always-on-top Picture-in-Picture control window.
- **Microphone** and **webcam overlay** (rounded / circle / square), composited into the recording.
- **Ripple timeline**: split clips, delete sections (gaps close automatically), and trim edges.
- **Click-to-zoom**: drag a target box over the preview to aim a smooth, eased zoom at any area — set strength by resizing the box.
- **Aspect ratios** (16:9 / 9:16 / 1:1) with letterboxing for social formats.
- **Export** to 1080p WebM, rendered in the browser.

## How it works

The browser can capture *pixels* of any surface, but it can't read mouse clicks outside its own tab (OS sandbox) — which is the only reason auto-zoom-on-click usually needs a native app. KindleWood Recorder side-steps that by making zoom a **manual target box** you place in the editor, keeping everything in the browser. See [DESIGN.md](./DESIGN.md) for the full architecture.

## Tech stack

- **Vite + React 19 + TypeScript**
- Browser media APIs: `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `<canvas>` 2D, Document Picture-in-Picture
- **Zod** for the versioned edit-manifest schema

## Project structure

```
src/
├─ record/   # capture state machine + MediaRecorder (getDisplayMedia/getUserMedia)
├─ render/   # pure rendering & encoding: zoom math, frame draw, export
├─ studio/   # editor UI: timeline, action bar, preview, left rail, controls
└─ types/    # VideoProject Zod schema + timeline/source mapping helpers
```

The core logic (`render/`, `types/`) is framework-agnostic and isolated from React, so it's easy to test and reason about.

## Getting started

Requires Node 20+ and a Chromium-based browser (Chrome / Edge) for the best capture support.

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production build
npm run preview  # serve the build
npm run lint
```

## Browser support

Best on **Chrome / Edge** on desktop (full `getDisplayMedia` + Document Picture-in-Picture). Firefox works for capture; Safari's screen-capture support is more limited.

## Roadmap

- [x] Capture (screen + mic + webcam), countdown, floating controls
- [x] Ripple timeline: split / delete / trim
- [x] Click-to-zoom target box, aspect ratios
- [x] 1080p WebM export
- [ ] MP4 (H.264 + AAC) export via ffmpeg.wasm — for X / CapCut
- [ ] Sound-effects & music tracks
- [ ] Background blur (MediaPipe)

## License

[MIT](./LICENSE) © Feifei Qiu
