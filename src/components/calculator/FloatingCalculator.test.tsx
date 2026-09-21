import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FloatingCalculator } from './FloatingCalculator'

/** The panel is open by default, so tests just reach for it. */
const open = () => screen.getByRole('region', { name: 'Calculator' })

const reopen = () => {
  fireEvent.click(screen.getByRole('button', { name: /open the calculator/i }))
  return screen.getByRole('region', { name: 'Calculator' })
}

const tap = (label: RegExp | string) => fireEvent.click(screen.getByRole('button', { name: label }))

/** The result lives in an <output>, which has the implicit role "status". */
const shown = () => screen.getByRole('status').textContent

describe('FloatingCalculator', () => {
  it('is open on first visit, showing zero', () => {
    render(<FloatingCalculator />)
    expect(screen.getByRole('region', { name: 'Calculator' })).toBeInTheDocument()
    expect(shown()).toBe('0')
  })

  it('collapses to a launcher once minimised', () => {
    localStorage.setItem('compressly.calculator', JSON.stringify({ x: 40, y: 40, open: false }))
    render(<FloatingCalculator />)
    expect(screen.queryByRole('region', { name: 'Calculator' })).not.toBeInTheDocument()
    reopen()
    expect(screen.getByRole('region', { name: 'Calculator' })).toBeInTheDocument()
  })

  it('adds from the keypad', () => {
    render(<FloatingCalculator />)
    open()
    tap(/digit 7/)
    tap(/add/)
    tap(/digit 8/)
    tap(/equals/)
    expect(shown()).toBe('15')
  })

  it('applies operations left to right, like the iOS calculator', () => {
    render(<FloatingCalculator />)
    open()
    for (const label of [/digit 2/, /add/, /digit 3/, /multiply/, /digit 4/, /equals/]) tap(label)
    expect(shown()).toBe('20')
  })

  it('accepts the physical keyboard while open', () => {
    render(<FloatingCalculator />)
    open()
    for (const key of ['2', '+', '3', 'Enter']) fireEvent.keyDown(window, { key })
    expect(shown()).toBe('5')
  })

  it('ignores the keyboard while a form field has focus', () => {
    render(
      <div>
        <input aria-label="a field" />
        <FloatingCalculator />
      </div>,
    )
    open()
    const field = screen.getByLabelText('a field')
    field.focus()
    fireEvent.keyDown(field, { key: '9' })
    expect(shown()).toBe('0')
  })

  it('shows Error when dividing by zero and recovers on clear', () => {
    render(<FloatingCalculator />)
    open()
    for (const label of [/digit 5/, /divide/, /digit 0/, /equals/]) tap(label)
    expect(shown()).toBe('Error')
    tap(/clear/)
    expect(shown()).toBe('0')
  })

  it('labels the clear key C while a number is open, AC once it is not', () => {
    render(<FloatingCalculator />)
    open()
    expect(screen.getByRole('button', { name: /clear/ }).textContent).toBe('AC')
    tap(/digit 4/)
    expect(screen.getByRole('button', { name: /clear/ }).textContent).toBe('C')
  })

  it('marks the pending operator so the display state is visible', () => {
    render(<FloatingCalculator />)
    open()
    tap(/digit 6/)
    tap(/multiply/)
    expect(screen.getByRole('button', { name: /multiply/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('closes on Escape and remembers the closed state', () => {
    render(<FloatingCalculator />)
    open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Calculator' })).not.toBeInTheDocument()
    expect(localStorage.getItem('compressly.calculator')).toContain('"open":false')
  })

  it('minimises from the title bar button', () => {
    render(<FloatingCalculator />)
    open()
    fireEvent.click(screen.getByRole('button', { name: /minimise the calculator/i }))
    expect(screen.getByRole('button', { name: /open the calculator/i })).toBeInTheDocument()
  })
})
