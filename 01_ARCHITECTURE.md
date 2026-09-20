# Architecture

Create a clean modular architecture.

Suggested structure:

src/
  components/
  features/image/
  features/video/
  hooks/
  lib/image/
  lib/video/
  lib/zip/
  workers/
  types/
  utils/

Separate UI from media engines, queue management, ZIP creation and downloads.

Use strict TypeScript. Avoid `any`.

Use Web Workers where appropriate so heavy processing does not freeze the UI.
