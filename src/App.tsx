import { useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { Dropzone } from '@/components/Dropzone'
import { ImageSettingsPanel } from '@/components/ImageSettingsPanel'
import { VideoSettingsPanel } from '@/components/VideoSettingsPanel'
import { QueuePanel } from '@/components/QueuePanel'
import { HistoryPanel } from '@/components/HistoryPanel'
import { PreviewDialog } from '@/components/PreviewDialog'
import { FloatingCalculator } from '@/components/calculator/FloatingCalculator'
import { AlertIcon, ShieldIcon } from '@/components/Icons'
import { useCompressor } from '@/hooks/useCompressor'
import { isRunnable } from '@/lib/queue/reducer'
import { useTheme } from '@/hooks/useTheme'
import { ENGINE_VERSION } from '@/lib/video/engine'
import { downloadBlob } from '@/utils/download'
import type { MediaKind, QueueItem } from '@/types/media'

export default function App() {
  const theme = useTheme()
  const [product, setProduct] = useState<MediaKind>('video')
  const [preview, setPreview] = useState<QueueItem | null>(null)
  const compressor = useCompressor()

  const runnableCount = compressor.items.filter(isRunnable).length

  const hasTransparentSource = compressor.items.some((item) => item.probe?.hasAlpha === true)
  const videoSample = compressor.items.find((item) => item.kind === 'video' && item.probe)?.probe ?? null

  const engineLabel = useMemo(() => {
    switch (compressor.engine.state) {
      case 'loading':
        return 'loading ffmpeg-core'
      case 'ready':
        return `ffmpeg-core ${ENGINE_VERSION} ready`
      case 'failed':
        return 'video engine unavailable'
      default:
        return `ffmpeg-core ${ENGINE_VERSION} idle`
    }
  }, [compressor.engine.state])

  const onDownloadGeneration = (lineageId: string, generationIndex: number) => {
    const row = compressor.items.find(
      (item) => item.lineageId === lineageId && item.generation === generationIndex,
    )
    if (!row) return
    // Generation 0 has no result — it is the untouched upload.
    if (generationIndex === 0) {
      downloadBlob(row.source, row.source.name)
      return
    }
    void compressor.downloadItem(row.id)
  }

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-4 z-50 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
      >
        Skip to the controls
      </a>

      <Header product={product} onProductChange={setProduct} theme={theme} engineLabel={engineLabel} />

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
            {product === 'video' ? 'Shrink video files in this tab' : 'Shrink image files in this tab'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {product === 'video'
              ? 'FFmpeg runs as WebAssembly here. Pick a preset, watch the real progress, and keep every output — nothing is uploaded.'
              : 'Canvas and WebP/AVIF encoders run here. Resize, pick a format, and protect transparency where it matters.'}
          </p>
        </div>

        {compressor.notice ? (
          <div
            role="status"
            className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 ${
              compressor.notice.tone === 'error'
                ? 'border-loss/40 bg-loss/10'
                : 'border-accent/40 bg-accent-soft'
            }`}
          >
            <AlertIcon className={`mt-0.5 h-4 w-4 ${compressor.notice.tone === 'error' ? 'text-loss' : 'text-accent'}`} />
            <p className="flex-1 text-[13px] leading-relaxed text-ink">{compressor.notice.text}</p>
            <button
              type="button"
              onClick={compressor.dismissNotice}
              className="btn-ghost btn-sm h-8 px-2 text-2xs"
              aria-label="Dismiss this message"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-5">
            <Dropzone kind={product} onFiles={compressor.addFiles} />

            <section aria-labelledby="settings-heading" className="surface p-4 sm:p-5">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 id="settings-heading" className="text-sm font-semibold">
                  {product === 'video' ? 'Video settings' : 'Image settings'}
                </h2>
                <span className="text-2xs text-ink-3">
                  applied when compression starts
                </span>
              </div>

              {product === 'video' ? (
                <VideoSettingsPanel
                  settings={compressor.videoSettings}
                  sample={videoSample}
                  onChange={compressor.updateVideoSettings}
                />
              ) : (
                <ImageSettingsPanel
                  settings={compressor.imageSettings}
                  encodable={compressor.encodable}
                  hasTransparentSource={hasTransparentSource}
                  onChange={compressor.updateImageSettings}
                />
              )}

              <button
                type="button"
                className="btn-primary mt-5 w-full"
                disabled={runnableCount === 0}
                onClick={() => compressor.start()}
              >
                {runnableCount === 0
                  ? 'Nothing waiting to compress'
                  : `Compress ${runnableCount} file${runnableCount === 1 ? '' : 's'}`}
              </button>
              {compressor.engine.state === 'failed' && product === 'video' ? (
                <p className="mt-2 text-2xs text-loss">
                  {compressor.engine.error?.title} — {compressor.engine.error?.detail}
                </p>
              ) : null}
            </section>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <QueuePanel
              items={compressor.items}
              summary={compressor.summary}
              zipProgress={compressor.zipProgress}
              onCancel={compressor.cancel}
              onRetry={compressor.retry}
              onRemove={compressor.remove}
              onDownload={(id) => void compressor.downloadItem(id)}
              onCompressAgain={compressor.compressAgain}
              onPreview={setPreview}
              onCancelAll={compressor.cancelAll}
              onClearCompleted={compressor.clearCompleted}
              onClearAll={compressor.clearAll}
              onDownloadZip={() => void compressor.downloadZip()}
            />

            <HistoryPanel lineages={compressor.lineages} onDownloadGeneration={onDownloadGeneration} />

            {compressor.items.length === 0 ? (
              <section className="surface p-5">
                <h2 className="text-sm font-semibold">What happens to your files</h2>
                <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
                  <li>
                    <span className="font-mono text-2xs text-accent">01</span> &nbsp;The file object is read by
                    this tab. It never reaches a network request.
                  </li>
                  <li>
                    <span className="font-mono text-2xs text-accent">02</span> &nbsp;
                    {product === 'video'
                      ? 'ffmpeg-core compiles once in a worker and stays warm for the rest of the batch.'
                      : 'Each image is decoded and encoded inside a worker, two at a time.'}
                  </li>
                  <li>
                    <span className="font-mono text-2xs text-accent">03</span> &nbsp;The output stays in memory as
                    a File. Download it, or send it through again with Compress again.
                  </li>
                  <li>
                    <span className="font-mono text-2xs text-accent">04</span> &nbsp;Closing the tab frees
                    everything. Nothing is written to storage.
                  </li>
                </ol>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
        <div className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <ShieldIcon className="h-4 w-4 text-accent" />
              Your media is processed locally in your browser. It is not uploaded to our servers.
            </p>
            <ul className="mt-3 space-y-1.5 text-2xs leading-relaxed text-ink-3">
              <li>No analytics, no third-party media APIs, no media in localStorage or URLs.</li>
              <li>The only external fetch would be the ffmpeg-core module — and it is served from this origin.</li>
              <li>Temporary files inside the WebAssembly filesystem are deleted after every job.</li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">What this build encodes</p>
            <dl className="mt-3 space-y-1.5 text-2xs leading-relaxed text-ink-3">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-ink-2">Video out</dt>
                <dd>MP4 with H.264 + AAC, or WebM with VP8 + Opus</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-ink-2">Image out</dt>
                <dd>
                  JPEG, PNG, WebP{compressor.encodable.includes('image/avif') ? ', AVIF' : ' — AVIF is not encodable in this browser'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-ink-2">Not here</dt>
                <dd>AV1 and HEVC are absent from the bundled core, VP9 aborts mid-encode, and two-pass is not offered</dd>
              </div>
            </dl>
          </div>
        </div>
      </footer>

      {preview ? <PreviewDialog item={preview} onClose={() => setPreview(null)} /> : null}
      <FloatingCalculator />
    </div>
  )
}
