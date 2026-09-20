# Performance

Optimize for large videos and batches.

Use:
- lazy FFmpeg loading
- Web Workers where useful
- controlled concurrency
- minimal Blob copies
- proper object URL cleanup
- FFmpeg temporary-file cleanup
- responsive progress UI
- cancellation where possible

Gracefully handle low-memory devices and very large files.
