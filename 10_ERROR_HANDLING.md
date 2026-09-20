# Error Handling

Handle:
- unsupported/corrupt media
- zero-byte files
- huge files
- FFmpeg load failure
- codec failure
- browser incompatibility
- memory failure
- cancellation
- ZIP failure
- download failure
- duplicate names
- removal during processing
- clear queue during processing

Never let one failed file destroy successful results.
Show concise user-facing messages and development-only diagnostics.
