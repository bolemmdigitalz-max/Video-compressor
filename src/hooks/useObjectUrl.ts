import { useEffect, useState } from 'react'

/**
 * Creates an object URL for a blob and revokes it when the blob changes or the
 * component unmounts. Every preview in the app goes through this so no blob URL
 * outlives the element that needed it.
 */
export function useObjectUrl(blob: Blob | File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(blob)
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
      setUrl(null)
    }
  }, [blob])

  return url
}
