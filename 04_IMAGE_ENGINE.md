# Image Engine

Implement local image compression with browser APIs.

Support JPEG, PNG, WebP and AVIF where available.

Implement:
- quality
- output format
- resize
- max width/height
- aspect-ratio preservation
- prevent upscaling
- transparency protection

Never silently convert transparent images to JPEG.

Return typed results with original/output size, dimensions, MIME, savings and processing time.

Revoke object URLs and prevent memory leaks.
