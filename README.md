# KindleWood Recorder

A minimal, browser-based screen recorder with manual click-to-zoom editing.

Record a screen, window, or browser tab (optionally with your mic), trim it, add
smooth **zoom blocks** by pinning a focus point on the timeline, then export a
finished video — all in the browser, no install.

Standalone project: publishable on its own and embeddable into KindleWood Studio later.

## Status

Early scaffold. See [DESIGN.md](./DESIGN.md) for the full design and build plan.

## Stack

- Vite + React 19 + TypeScript
- Browser media APIs: `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `<canvas>`
- Zod for the edit-manifest schema

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Roadmap (v1)

1. Capture — source picker, optional mic, record to blob
2. Trim + preview
3. Zoom blocks — pin focus point, eased zoom in/out
4. Export — canvas re-render → downloadable video
5. Audio polish — mic + optional SFX overlay

Non-goals for v1: automatic zoom-on-click (needs a native app), webcam overlay
(v2), multi-clip editing. See [DESIGN.md](./DESIGN.md).
