import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

const png = (name: string, size = 240_000) => {
  const file = new File(['not-real-pixels'], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const upload = (files: File[]) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  expect(input).not.toBeNull()
  fireEvent.change(input, { target: { files } })
}

describe('App', () => {
  it('opens on the video compressor', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shrink video files in this tab')
    expect(screen.getByRole('radiogroup', { name: /preset/i })).toBeInTheDocument()
  })

  it('switches product tabs and swaps the settings panel', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Images$/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shrink image files in this tab')
    expect(screen.getByLabelText('Output format')).toBeInTheDocument()
    expect(screen.getByLabelText('Protect transparency')).toBeInTheDocument()
  })

  it('toggles the theme on the document element', () => {
    render(<App />)
    const toggle = screen.getByRole('button', { name: /switch to the (light|dark) palette/i })
    const before = document.documentElement.classList.contains('dark')
    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('dark')).toBe(!before)
    expect(localStorage.getItem('compressly.theme')).toBe(before ? 'light' : 'dark')
  })

  it('probes an uploaded image and lists it in the queue', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Images$/ }))
    upload([png('photo.png')])

    expect(await screen.findByText('photo.png')).toBeInTheDocument()
    // Probing is async: dimensions come from the decoded bitmap.
    expect(await screen.findByText('1600 × 1200')).toBeInTheDocument()
    expect(screen.getByText('240 KB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compress 1 file' })).toBeEnabled()
  })

  it('rejects a non-media file with an explanation instead of dropping it silently', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Images$/ }))
    const notes = new File(['x'], 'notes.txt', { type: 'text/plain' })
    upload([notes])

    expect(await screen.findByText('Not an image or video')).toBeInTheDocument()
    expect(screen.getByText(/notes\.txt is reported as "text\/plain"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nothing waiting to compress' })).toBeDisabled()
  })

  it('rejects a zero-byte file', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Images$/ }))
    upload([png('empty.png', 0)])
    expect(await screen.findByText('Empty file')).toBeInTheDocument()
  })

  it('detects which image encoders this browser supports', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Images$/ }))
    const read = () =>
      Array.from((screen.getByLabelText('Output format') as HTMLSelectElement).options).map(
        (option) => option.textContent ?? '',
      )
    expect(read().join(' | ')).toContain('AVIF')
    // Detection is async: once it resolves nothing is greyed out in this browser.
    await waitFor(() => expect(read().some((label) => label.includes('not supported here'))).toBe(false))
  })

  it('states the privacy guarantee and the codec limits', () => {
    render(<App />)
    expect(
      screen.getByText(/Your media is processed locally in your browser\. It is not uploaded to our servers\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/VP9 aborts mid-encode/)).toBeInTheDocument()
    // The UI must not offer a codec the bundled core cannot run.
    fireEvent.click(screen.getByRole('button', { name: /container and encoder/i }))
    const formats = Array.from((screen.getByLabelText('Output format') as HTMLSelectElement).options).map(
      (option) => option.textContent ?? '',
    )
    expect(formats).toContain('WebM — VP8 + Opus')
    expect(formats.join(' | ')).not.toContain('VP9')
  })

  it('exposes a keyboard path into the app', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /skip to the controls/i })).toBeInTheDocument()
  })
})
