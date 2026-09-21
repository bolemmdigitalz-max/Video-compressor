import { useEffect, useState } from 'react'

interface ThumbnailProps {
  file: File | null
  /** Poster frame for videos, captured during probing. */
  poster?: string
  alt: string
}

/**
 * Renders a file preview from an object URL and revokes it on unmount or when the
 * source changes, so a 200-file batch does not strand 200 blob URLs.
 */
export function Thumbnail({ file, poster, alt }: ThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
      setUrl(null)
    }
  }, [file])

  if (poster) {
    return (
      <img
        src={poster}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )
  }

  if (url) {
    return <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" decoding="async" />
  }

  return (
    <span className="grid h-full w-full place-items-center bg-surface-2 text-2xs text-ink-3">no preview</span>
  )
}
