import { AlertIcon, ArchiveIcon, StopIcon, TrashIcon } from '@/components/Icons'
import { QueueRow } from '@/components/QueueRow'
import { ProgressBar } from '@/components/ui/primitives'
import { describeSavings, formatBytes } from '@/utils/format'
import type { QueueSummary } from '@/lib/queue/reducer'
import type { QueueItem } from '@/types/media'

interface QueuePanelProps {
  items: readonly QueueItem[]
  summary: QueueSummary
  zipProgress: number | null
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onDownload: (id: string) => void
  onCompressAgain: (id: string) => void
  onPreview: (item: QueueItem) => void
  onCancelAll: () => void
  onClearCompleted: () => void
  onClearAll: () => void
  onDownloadZip: () => void
}

export function QueuePanel({
  items,
  summary,
  zipProgress,
  onCancel,
  onRetry,
  onRemove,
  onDownload,
  onCompressAgain,
  onPreview,
  onCancelAll,
  onClearCompleted,
  onClearAll,
  onDownloadZip,
}: QueuePanelProps) {
  if (items.length === 0) return null

  const savingsText =
    summary.completed > 0
      ? describeSavings(summary.completedBytesIn, summary.completedBytesOut)
      : null

  return (
    <section aria-labelledby="queue-heading" className="space-y-3">
      <div className="surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="queue-heading" className="text-sm font-semibold">
            Queue
            <span className="tnum ml-2 font-mono text-2xs font-normal text-ink-3">
              {summary.total} file{summary.total === 1 ? '' : 's'}
            </span>
          </h2>

          <p aria-live="polite" className="tnum font-mono text-2xs text-ink-3">
            {[
              summary.processing > 0 ? `${summary.processing} working` : null,
              summary.queued > 0 ? `${summary.queued} queued` : null,
              summary.completed > 0 ? `${summary.completed} done` : null,
              summary.failed > 0 ? `${summary.failed} failed` : null,
              summary.cancelled > 0 ? `${summary.cancelled} cancelled` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {summary.anythingRunning ? (
          <div className="mt-3">
            <ProgressBar
              ratio={summary.overallRatio}
              label={`Overall ${Math.round(summary.overallRatio * 100)}%`}
              state="active"
            />
          </div>
        ) : null}

        {savingsText ? (
          <p className="tnum mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink">
            {formatBytes(summary.completedBytesIn)} → {formatBytes(summary.completedBytesOut)}
            <span className="ml-2 text-gain">{savingsText}</span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {summary.anythingRunning ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onCancelAll}>
              <StopIcon />
              Stop all
            </button>
          ) : null}
          {summary.completed > 0 ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={onDownloadZip} disabled={zipProgress !== null}>
                <ArchiveIcon />
                {zipProgress === null
                  ? 'Download all as ZIP'
                  : `Building ZIP ${Math.round(zipProgress * 100)}%`}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={onClearCompleted}>
                Clear finished
              </button>
            </>
          ) : null}
          {summary.anythingRunning ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={onClearAll}>
              <TrashIcon />
              Clear all
            </button>
          )}
        </div>

        {zipProgress !== null ? (
          <p role="status" className="mt-2 text-2xs text-ink-3">
            Archiving {summary.completed} file{summary.completed === 1 ? '' : 's'} in this tab.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            onCancel={onCancel}
            onRetry={onRetry}
            onRemove={onRemove}
            onDownload={onDownload}
            onCompressAgain={onCompressAgain}
            onPreview={onPreview}
          />
        ))}
      </div>

      {summary.failed > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs text-ink-2">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 text-loss" />
          The other files finished normally. A failure only affects its own row — retry it, or remove it and
          download the rest.
        </p>
      ) : null}
    </section>
  )
}
