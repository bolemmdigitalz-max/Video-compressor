import { useCallback, useRef, useState, type DragEvent } from 'react'
import { ImageIcon, VideoIcon } from '@/components/Icons'
import type { MediaKind } from '@/types/media'

interface DropzoneProps {
  kind: MediaKind
  onFiles: (files: File[]) => void
  disabled?: boolean
}

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*,.mov,.mkv',
}

const FORMATS: Record<MediaKind, string> = {
  image: 'JPEG · PNG · WebP · AVIF · GIF · BMP',
  video: 'MP4 · WebM · MOV · MKV · AVI',
}

export function Dropzone({ kind, onFiles, disabled = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return
      onFiles(Array.from(list))
    },
    [onFiles],
  )

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current += 1
    if (event.dataTransfer.types.includes('Files')) setDragging(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    accept(event.dataTransfer.files)
  }

  const noun = kind === 'video' ? 'videos' : 'images'

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="group"
      aria-label={`Add ${noun}`}
      className={`rounded-xl border border-dashed p-6 text-center transition-colors sm:p-8 ${
        dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
          dragging ? 'border-accent bg-bg text-accent' : 'border-line bg-bg text-ink-2'
        }`}
      >
        {kind === 'video' ? <VideoIcon className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
      </span>

      <p className="text-[15px] font-medium text-ink">
        {dragging ? `Release to add ${noun}` : `Drop ${noun} here`}
      </p>
      <p className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-3">{FORMATS[kind]}</p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT[kind]}
        className="sr-only-focusable"
        onChange={(event) => {
          accept(event.target.files)
          // Resetting lets the same file be picked again after a removal.
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose {noun}
      </button>
      <p className="mt-3 text-2xs text-ink-3">
        Files are read by this tab only. No upload, no account.
      </p>
    </div>
  )
}
