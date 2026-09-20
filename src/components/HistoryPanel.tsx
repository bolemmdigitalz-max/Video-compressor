import { DownloadIcon } from '@/components/Icons'
import { describeSavings, formatBytes, formatResolution } from '@/utils/format'
import type { Lineage } from '@/hooks/useCompressor'

interface HistoryPanelProps {
  lineages: readonly Lineage[]
  onDownloadGeneration: (lineageId: string, generationIndex: number) => void
}

/**
 * The generation chain from spec 06: Original ↓ Version 1 ↓ Version 2, each row
 * carrying its own size, resolution, codec and both savings figures.
 */
export function HistoryPanel({ lineages, onDownloadGeneration }: HistoryPanelProps) {
  if (lineages.length === 0) return null

  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="history-heading" className="text-sm font-semibold">
          Compression history
        </h2>
        <p className="text-2xs text-ink-3">every pass of the same source file</p>
      </div>

      {lineages.map((lineage) => (
        <article key={lineage.id} className="surface p-4">
          <h3 className="truncate text-[13px] font-medium text-ink" title={lineage.originalName}>
            {lineage.originalName}
          </h3>
          <p className="mt-0.5 text-2xs text-ink-3">
            {lineage.passes} pass{lineage.passes === 1 ? '' : 'es'} · {lineage.kind === 'video' ? 'video' : 'image'}
          </p>

          <ol className="mt-3 space-y-0">
            {lineage.rows.map((row, index) => (
              <li key={`${row.index}-${row.name}`}>
                {index > 0 ? (
                  <div aria-hidden="true" className="ml-[7px] h-3 w-px bg-line-strong" />
                ) : null}
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      row.isOriginal ? 'border-line-strong bg-surface' : 'border-accent bg-accent'
                    }`}
                  />
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[13px] font-medium text-ink">
                        {row.isOriginal ? 'Original' : `Version ${row.index}`}
                        <span className="tnum ml-2 font-mono text-2xs font-normal text-ink-2">
                          {formatBytes(row.sizeBytes)}
                        </span>
                      </p>
                      <button
                        type="button"
                        className="btn-ghost btn-sm h-8 px-2 text-2xs"
                        onClick={() => onDownloadGeneration(lineage.id, row.index)}
                        aria-label={`Download ${row.isOriginal ? 'the original' : `version ${row.index}`} of ${lineage.originalName}`}
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </div>
                    <p className="tnum mt-0.5 font-mono text-2xs text-ink-3">
                      {formatResolution(row.dimensions)} · {row.codecLabel}
                    </p>
                    {row.isOriginal ? null : (
                      <p className="mt-1 text-2xs text-ink-2">
                        <span className={row.fromPreviousPercent < 0 ? 'text-loss' : 'text-gain'}>
                          {describeSavings(row.sizeBytes + row.fromPreviousBytes, row.sizeBytes)} than the previous
                          pass
                        </span>
                        <span className="text-ink-3">
                          {' '}
                          · {describeSavings(row.sizeBytes + row.fromOriginalBytes, row.sizeBytes)} than the original
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {lineage.advisory === 'diminishing' ? (
            <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-2xs text-ink-2">
              The last pass bought almost nothing. Another one costs quality for a few bytes.
            </p>
          ) : null}
        </article>
      ))}

      <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs text-ink-2">
        Re-compressing an already compressed video can reduce quality further. Each pass re-encodes from the
        previous output, not from the original file.
      </p>
    </section>
  )
}
