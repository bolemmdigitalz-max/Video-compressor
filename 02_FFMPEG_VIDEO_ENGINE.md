# FFmpeg WebAssembly Engine

Implement real browser-side video compression.

Requirements:
- lazy-load FFmpeg
- show loading state
- process locally
- report progress
- cancellation where feasible
- clean temporary files/resources
- recover from FFmpeg errors
- one failed file must not kill the batch

Pipeline:
File → FFmpeg input → encoding settings → output → Blob/File → typed result

Prioritize MP4/H.264 for compatibility. Do not advertise codecs that are not actually supported.

Expose sensible quality/resolution/FPS/audio controls.

Do not promise exact output sizes before encoding.

The generated File must be accepted by the same pipeline for **Compress Again**.
