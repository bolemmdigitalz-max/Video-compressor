# Compressly

Image and video compression that runs entirely in the browser tab. Files are read
from disk by the page, encoded by WebAssembly or the canvas API, and handed back
as a download. There is no backend, no account, and no media request leaves the
device.

Built to the brief in `00_MASTER_BRIEF.md` … `14_DEPLOYMENT.md`.

## Run it

```bash
npm install        # also vendors ffmpeg-core into public/vendor/ffmpeg
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build
npm run preview    # serves dist/ on http://localhost:4173
npm test           # 149 unit + component tests, plus 7 real-ffmpeg integration tests
npm run audit:privacy
```

`npm install` runs `scripts/copy-ffmpeg-assets.mjs`, which copies
`@ffmpeg/core`'s `ffmpeg-core.js` and `ffmpeg-core.wasm` (32 MB) into
`public/vendor/ffmpeg/`. That directory is git-ignored: it is build input, not
source. Serving the files verbatim keeps the wasm MIME type and caching under our
control instead of hashing a 32 MB binary on every build.

## What it does

**Workflow** — upload → configure → compress → review → download → compress again.
Uploads are probed immediately so size, dimensions and duration appear at once,
then wait for the Compress button rather than starting on their own.

**Video** — real FFmpeg WebAssembly, lazy-loaded on the first video and kept warm
for the rest of the batch. Presets Fast / Balanced / Small File / Custom, with
CRF, resolution, frame rate, audio bitrate, container and x264 speed exposed. The
Advanced panel prints the exact `ffmpeg` command that will run for the first file
in the queue. Progress comes from ffmpeg's own time-based callback; cancel
terminates the worker, because WebAssembly has no cooperative stop.

**Images** — `createImageBitmap` + canvas inside a dedicated worker, two at a
time. Quality, resize with a longest-edge cap, aspect-ratio preservation, no
upscaling, and transparency protection: a source with alpha is never routed into
JPEG, and if the user opts out of protection the flattening is reported rather
than done silently.

**Compress Again** — every finished output goes straight back through the same
pipeline as a new generation, tracked in a chain (Original ↓ Version 1 ↓ Version 2)
with per-pass and cumulative savings. The quality warning is shown on every pass
after the first, and the panel says so plainly when a pass bought less than 2%.

**Queue** — typed states `idle | queued | processing | completed | failed |
cancelled`, per-file and overall progress, retry, remove, clear finished, clear
all, individual download, ZIP download, and partial-failure handling: one bad file
never discards the results next to it.

**Interface** — white and blue only, on a single blue ramp; red is reserved for
failures and destructive actions so it keeps meaning. Dark and light palettes are
both defined, toggled in the header, persisted, and defaulted from
`prefers-color-scheme` before first paint so there is no flash. A floating,
draggable iOS-style calculator sits over the page for bitrate and savings
arithmetic. It opens on first visit, can be dragged by its title bar, minimises to a
launcher, and is fully keyboard driven.

## Layout

```
src/
  components/            UI only — no media logic
    calculator/          floating calculator + its arithmetic engine
    ui/                  labelled controls, progress bar, disclosure
  hooks/                 useCompressor (orchestrator), useTheme, useObjectUrl
  lib/image/             probe, geometry, transparency, encode, compress, job runner
  lib/video/             engine, args builder, presets, probe
  lib/queue/             reducer (state machine) and Pool (concurrency)
  lib/zip/               archive creation with duplicate-name handling
  lib/history/           generation chain maths
  workers/               image encoding worker
  types/                 domain types, no `any`
  utils/                 formatting, downloads, error classification
scripts/                 ffmpeg asset vendoring, privacy audit
```

The brief's suggested `features/image` and `features/video` folders are folded
into `lib/image`, `lib/video` and `components/`: UI stays separate from engines,
queue, ZIP and downloads, which is the property the structure was meant to
guarantee.

## Verified

`npm test` runs 156 tests. What they actually execute:

- **`src/lib/video/args.integration.test.ts`** — loads the real 32 MB
  `ffmpeg-core.wasm` in Node, generates a genuine 1280×720 H.264 + AAC clip with
  lavfi, and encodes it with the exact array `buildVideoArgs` produces for each
  preset. It asserts exit codes, output sizes, and ffprobe-reported codec and
  dimensions; feeds an output back in as the next input, which is what Compress
  Again depends on; and asserts a corrupt file yields a non-zero exit.
- **Queue state machine** — every transition, progress clamping, re-queue rules,
  removal during processing, clear-completed versus clear-all, and which failures
  may be retried.
- **Calculator engine** — iOS semantics: left-to-right evaluation with no
  precedence, repeated `=` repeating the last operation, `%` after `+` meaning a
  share of the running total, divide-by-zero latching Error, C/AC behaviour,
  nine-digit limit, thousands grouping, scientific notation.
- **Savings maths** — the brief's own example (100 MB → 31 MB = 69% smaller),
  growth reported as growth, zero-byte inputs returning 0% instead of NaN.
- **Format routing** — ten cases covering transparent sources, unavailable
  encoders and fallback order.
- **Components** — App renders, product tabs swap panels, the theme toggle moves
  the class on `<html>`, uploads are probed and listed, non-media and zero-byte
  files are rejected with a reason, and the calculator responds to the keypad,
  the physical keyboard and Escape.

`tsc --noEmit` is clean under `strict`, `noUncheckedIndexedAccess` and
`noUnusedLocals`, with zero uses of `any`.

`npm run audit:privacy` scans 38 source files for network primitives, analytics,
persistent writes and external origins, and exits non-zero on any finding. It is
verified to catch a violation, not just to pass.

The production build was served with `npm run preview` and checked by request:
`/`, both worker chunks, the CSS and JS bundles, `ffmpeg-core.js`, and
`ffmpeg-core.wasm` all return 200 — the wasm as `application/wasm` with
`Accept-Ranges: bytes`, which streaming compilation needs.

## Findings that changed the product

**VP9 does not work in this core build.** `@ffmpeg/core@0.12.10` compiles
`libvpx-vp9` in, but every invocation — with CRF, with `-b:v`, with or without
`-pix_fmt`, with `-deadline realtime` — aborts the module with `memory access
out of bounds`. `libvpx` (VP8) encodes correctly in the same build, including
with `-crf`, `-cpu-used` and `libopus` audio. The WebM option therefore offers
**VP8 + Opus**, and a test records the VP9 failure so a future core upgrade that
fixes it fails loudly and re-opens the option. AV1 is absent from the binary and
is never offered.

**Rejected files were being added as "Ready".** The queue reducer's `add` action
rebuilt every row from a narrow input shape, so a file refused at upload (not
media, 0 bytes, over the size cap) reappeared as an idle row with its reason
thrown away. `add` now carries status and error through, and a terminally
rejected row no longer offers a Retry it could never honour.

**Uploads were starting before the settings could be read.** They now probe for
display and wait for Compress, matching the brief's workflow.

## Known limits

- **Single-threaded encoding.** The single-thread core is used deliberately: the
  multithreaded one needs `SharedArrayBuffer`, so the host must send
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. Without those headers
  `crossOriginIsolated` is false and the MT core will not start. H.264 at
  `faster`/720p runs roughly a few times slower than realtime here; VP8 is slower
  still.
- **Memory.** Input and output both live in the WebAssembly heap at once, so a
  1.5 GB clip needs several GB of address space. Very large files fail with a
  memory error rather than degrading gracefully. Video concurrency is fixed at 1
  for the same reason.
- **Cancel is destructive.** Terminating the worker discards the whole module;
  the next video pays the load cost again.
- **Audio-track detection is best effort.** Safari, Firefox and Chrome each expose
  it differently; when none of them do, the row says nothing rather than guessing.
- **AVIF encoding** is offered only when `canvas.toBlob` proves it works. Safari
  cannot encode AVIF, so the option is greyed out there instead of failing later.
- **The ffmpeg worker contains an unpkg fallback URL** for `ffmpeg-core.js`. It is
  only used when `coreURL` is omitted, and this app always passes explicit
  same-origin URLs, so it is never reached. To make that structural rather than
  by inspection, add a `Content-Security-Policy` at the host —
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self';
  img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline'; object-src 'none'`. It is not enabled in the
  app itself because it could not be exercised in a real browser in this
  environment.

## Remaining risks

- The UI has not been driven in a real browser here: no Chromium could be
  installed in this sandbox (the Playwright CDN is unreachable). Component
  behaviour is covered under jsdom and the media pipeline under real ffmpeg, but
  drag-and-drop, focus trapping, video playback and the calculator's pointer
  dragging are unexercised.
- Long batches on low-memory phones are untested.
- Encoding speed figures are indicative, not measured across devices.
