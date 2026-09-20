import { AlertIcon, CheckIcon, DownloadIcon, EyeIcon, RepeatIcon, StopIcon, TrashIcon } from '@/components/Icons'
import { ProgressBar } from '@/components/ui/primitives'
import { Thumbnail } from '@/components/Thumbnail'
import { computeSavings, describeSavings, formatBytes, formatDuration, formatPercent, formatResolution } from '@/utils/format'
import { diagnosticOf } from '@/utils/errors'
import { isTerminallyRejected } from '@/lib/queue/reducer'
import type { QueueItem, QueueStatus } from '@/types/media'

interface QueueRowProps {
  item: QueueItem
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onDownload: (id: string) => void
  onCompressAgain: (id: string) => void
  onPreview: (item: QueueItem) => void
}

const STATUS_COPY: Record<QueueStatus, string> = {
  idle: 'Ready',
  queued: 'Queued',
  processing: 'Working',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<QueueStatus, string> = {
  idle: 'border-line bg-surface-2 text-ink-3',
  queued: 'border-line-strong bg-surface-2 text-ink-2',
  processing: 'border-accent bg-accent-soft text-accent',
  completed: 'border-gain/40 bg-gain/10 text-gain',
  failed: 'border-loss/40 bg-loss/10 text-loss',
  cancelled: 'border-line bg-surface-2 text-ink-3',
}

export function QueueRow({
  item,
  onCancel,
  onRetry,
  onRemove,
  onDownload,
  onCompressAgain,
  onPreview,
}: QueueRowProps) {
  const result = item.result
  const sourceBytes = item.probe?.sizeBytes ?? item.source.size
  const savings = result ? computeSavings(sourceBytes, result.sizeBytes) : null
  const diagnostic = diagnosticOf(item.error ?? item.probeError)
  const busy = item.status === 'processing' || item.status === 'queued'

  return (
    <article className="surface animate-fade-up p-3 sm:p-4" aria-label={`${item.source.name}, ${STATUS_COPY[item.status]}`}>
      <div className="flex gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
          <Thumbnail
            file={item.kind === 'image' ? item.source : null}
            poster={item.probe?.thumbnailUrl}
            alt={`${item.source.name} thumbnail`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-ink" title={item.source.name}>
                {item.source.name}
              </h3>
              <p className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs text-ink-3">
                <span>{formatBytes(sourceBytes)}</span>
                {item.probe ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatResolution(item.probe.dimensions)}</span>
                  </>
                ) : null}
                {item.probe?.durationMs ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(item.probe.durationMs)}</span>
                  </>
                ) : null}
                {item.probe?.hasAlpha ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>has transparency</span>
                  </>
                ) : null}
                {item.probe?.hasAudio === false ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>no audio track</span>
                  </>
                ) : null}
                {item.generation > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-accent">pass {item.generation + 1}</span>
                  </>
                ) : null}
              </p>
            </div>

            <span className={`chip shrink-0 ${STATUS_TONE[item.status]}`}>
              {item.status === 'completed' ? <CheckIcon className="h-3 w-3" /> : null}
              {item.status === 'failed' ? <AlertIcon className="h-3 w-3" /> : null}
              {STATUS_COPY[item.status]}
            </span>
          </div>

          {busy ? (
            <div className="mt-3">
              <ProgressBar
                ratio={item.progress}
                label={item.progressLabel}
                state={item.status === 'processing' ? 'active' : 'idle'}
              />
            </div>
          ) : null}

          {item.status === 'completed' && result && savings ? (
            <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
              <p className="tnum flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[13px] text-ink">
                <span>{formatBytes(sourceBytes)}</span>
                <span className="text-ink-3" aria-hidden="true">
                  →
                </span>
                <span>{formatBytes(result.sizeBytes)}</span>
                <span className={savings.grew ? 'text-loss' : 'text-gain'}>
                  {describeSavings(sourceBytes, result.sizeBytes)}
                </span>
              </p>
              <p className="mt-1 text-2xs text-ink-3">
                {result.codecLabel} · {formatResolution(result.dimensions)} · encoded in{' '}
                {(result.elapsedMs / 1000).toFixed(1)} s
              </p>
            </div>
          ) : null}

          {item.status === 'failed' && (item.error ?? item.probeError) ? (
            <div className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5">
              <p className="text-[13px] font-medium text-loss">{(item.error ?? item.probeError)?.title}</p>
              <p className="mt-0.5 text-2xs text-ink-2">{(item.error ?? item.probeError)?.detail}</p>
              {import.meta.env.DEV && diagnostic ? (
                <pre className="mt-2 overflow-x-auto font-mono text-2xs text-ink-3">{diagnostic}</pre>
              ) : null}
            </div>
          ) : null}

          {item.status === 'cancelled' ? (
            <p className="mt-3 text-2xs text-ink-3">
              Stopped before it finished. Nothing was written for this file.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {busy ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => onCancel(item.id)}>
                <StopIcon />
                Cancel
              </button>
            ) : null}

            {item.status === 'completed' ? (
              <>
                <button type="button" className="btn-primary btn-sm" onClick={() => onCompressAgain(item.id)}>
                  <RepeatIcon />
                  Compress again
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => onDownload(item.id)}>
                  <DownloadIcon />
                  Download
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => onPreview(item)}>
                  <EyeIcon />
                  Preview
                </button>
                {savings ? (
                  <span className="tnum ml-auto font-mono text-2xs text-ink-3">
                    {formatPercent(Math.abs(savings.percent))} {savings.grew ? 'larger' : 'smaller'}
                  </span>
                ) : null}
              </>
            ) : null}

            {item.status === 'cancelled' || (item.status === 'failed' && !isTerminallyRejected(item)) ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => onRetry(item.id)}>
                <RepeatIcon />
                Retry
              </button>
            ) : null}

            {!busy ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.source.name} from the queue`}
              >
                <TrashIcon />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
