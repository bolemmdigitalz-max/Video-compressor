# Deployment

Prepare a static Vite production build.

Verify:
- npm install
- npm run dev
- npm run build
- npm run preview

Ensure FFmpeg WebAssembly assets/workers are correctly served in production.

Check worker loading, asset paths, MIME requirements, cross-origin isolation requirements if the selected implementation needs them, SPA hosting, and absence of secrets/backend dependencies.

Test the actual production build before completion.
