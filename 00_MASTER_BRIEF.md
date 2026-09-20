# Compressly — Image + Video Compressor

Build a production-quality privacy-first browser media compressor with React, Vite and TypeScript.

## Stack
- React + Vite + TypeScript
- Tailwind CSS
- FFmpeg WebAssembly for video
- Canvas/browser APIs for images
- JSZip for batch downloads
- No backend, database, authentication, or media uploads

## Core workflow
Upload → Configure → Compress → Review → Download → Compress Again

## Products
- Image Compressor
- Video Compressor

## Video
Support practical browser-compatible MP4/H.264 first. Add WebM/VP9 only when reliable.

Controls:
- presets: Fast, Balanced, Small File, Custom
- quality/CRF where supported
- resolution
- FPS
- audio bitrate
- output format
- progress
- cancel
- preview
- download

## Images
Support JPEG, PNG, WebP and AVIF where supported.
Include quality, resize, aspect-ratio preservation and transparency protection.

## Critical feature
Every completed output can be sent back through the compressor with **Compress Again**.

Repeated lossy encoding must show a warning that quality can decrease.

## Batch
- multi-file upload
- queue
- per-file progress
- overall progress
- retry
- remove
- individual download
- ZIP download
- partial failure handling

## Privacy
All media processing must happen locally. Do not send media to servers, analytics, or third-party processing APIs.

## UX
Premium, minimal, responsive, mobile-first, accessible. No fake testimonials, statistics, certifications, or claims.
