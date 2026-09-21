import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from '@/components/Icons'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { computeSavings, describeSavings, formatBytes, formatDuration, formatResolution } from '@/utils/format'
import type { QueueItem } from '@/types/media'

interface PreviewDialogProps {
  item: QueueItem
  onClose: () => void
}

/**
 * Accessible modal: focus moves in on open, Tab is trapped, Escape closes, and the
 * object URL backing the media is revoked when the dialog unmounts.
 */
export function PreviewDialog({ item, onClose }: PreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [compare, setCompare] = useState<'output' | 'source'>('output')
  const url = useObjectUrl(compare === 'output' ? (item.result?.file ?? null) : item.source)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const result = item.result
  const savings = result ? computeSavings(item.probe?.sizeBytes ?? item.source.size, result.sizeBytes) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${item.source.name}`}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-bg shadow-lift animate-pop-in sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{item.source.name}</h2>
            <p className="mt-0.5 font-mono text-2xs text-ink-3">
              {result?.codecLabel ?? (item.source.type || 'unknown type')}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="btn-ghost btn-sm h-10 w-10 shrink-0 rounded-lg p-0"
            aria-label="Close preview"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line bg-surface px-5 py-3">
          <div className="flex gap-1 rounded-lg border border-line bg-bg p-1" role="group" aria-label="Which file to show">
            <button
              type="button"
              onClick={() => setCompare('source')}
              aria-pressed={compare === 'source'}
              className={`min-h-9 flex-1 rounded-md px-3 text-[13px] font-medium transition-colors ${
                compare === 'source' ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              Source · {formatBytes(item.probe?.sizeBytes ?? item.source.size)}
            </button>
            <button
              type="button"
              onClick={() => setCompare('output')}
              disabled={!result}
              aria-pressed={compare === 'output'}
              className={`min-h-9 flex-1 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                compare === 'output' ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              Output · {result ? formatBytes(result.sizeBytes) : '—'}
            </button>
          </div>
        </div>

        <div className="bg-ink/[0.04] px-5 py-4 dark:bg-surface">
          {url ? (
            item.kind === 'video' ? (
              <video
                src={url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[52vh] w-full rounded-lg border border-line bg-ink"
              />
            ) : (
              <img
                src={url}
                alt={`${item.source.name}, ${compare === 'output' ? 'compressed output' : 'original source'}`}
                className="mx-auto max-h-[52vh] w-auto max-w-full rounded-lg border border-line bg-surface-2 object-contain"
              />
            )
          ) : (
            <p className="py-10 text-center text-sm text-ink-3">No output file to show yet.</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4">
          <Stat label="Source size" value={formatBytes(item.probe?.sizeBytes ?? item.source.size)} />
          <Stat label="Output size" value={result ? formatBytes(result.sizeBytes) : '—'} />
          <Stat
            label="Dimensions"
            value={
              compare === 'output' && result
                ? formatResolution(result.dimensions)
                : item.probe
                  ? formatResolution(item.probe.dimensions)
                  : '—'
            }
          />
          <Stat
            label={item.kind === 'video' ? 'Duration' : 'Change'}
            value={
              item.kind === 'video' && item.probe?.durationMs
                ? formatDuration(item.probe.durationMs)
                : savings
                  ? describeSavings(item.probe?.sizeBytes ?? item.source.size, result?.sizeBytes ?? 0)
                  : '—'
            }
          />
        </dl>

        {savings && result ? (
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-2">
            {formatBytes(item.probe?.sizeBytes ?? item.source.size)} → {formatBytes(result.sizeBytes)},{' '}
            <span className={savings.grew ? 'text-loss' : 'text-gain'}>
              {describeSavings(item.probe?.sizeBytes ?? item.source.size, result.sizeBytes)}
            </span>
            {result.elapsedMs ? ` in ${(result.elapsedMs / 1000).toFixed(1)} s` : ''}
            {savings.grew ? ' — the source was already tightly encoded at these settings.' : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="tnum mt-0.5 font-mono text-[13px] text-ink">{value}</dd>
    </div>
  )
}
