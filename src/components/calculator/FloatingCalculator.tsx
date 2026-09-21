import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { CalculatorIcon, ChevronIcon, CloseIcon } from '@/components/Icons'
import { clearLabel, display, initialCalcState, keyFromEvent, keySymbol, press } from './calculatorEngine'
import type { CalcKey, CalcState } from './calculatorEngine'

const PANEL_WIDTH = 288
const EDGE = 16
const STORAGE_KEY = 'compressly.calculator'

type KeyDef = { key: CalcKey; span?: 2; tone: 'fn' | 'digit' | 'op' }

const KEYS: readonly (readonly KeyDef[])[] = [
  [
    { key: 'clear', tone: 'fn' },
    { key: 'negate', tone: 'fn' },
    { key: 'percent', tone: 'fn' },
    { key: 'divide', tone: 'op' },
  ],
  [
    { key: '7', tone: 'digit' },
    { key: '8', tone: 'digit' },
    { key: '9', tone: 'digit' },
    { key: 'multiply', tone: 'op' },
  ],
  [
    { key: '4', tone: 'digit' },
    { key: '5', tone: 'digit' },
    { key: '6', tone: 'digit' },
    { key: 'subtract', tone: 'op' },
  ],
  [
    { key: '1', tone: 'digit' },
    { key: '2', tone: 'digit' },
    { key: '3', tone: 'digit' },
    { key: 'add', tone: 'op' },
  ],
  [
    { key: '0', span: 2, tone: 'digit' },
    { key: '.', tone: 'digit' },
    { key: 'equals', tone: 'op' },
  ],
]

const KEY_NAMES: Partial<Record<CalcKey, string>> = {
  clear: 'clear',
  negate: 'plus or minus',
  percent: 'percent',
  divide: 'divide',
  multiply: 'multiply',
  subtract: 'subtract',
  add: 'add',
  equals: 'equals',
  '.': 'decimal point',
}

interface StoredLayout {
  x: number
  y: number
  open: boolean
}

function readLayout(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredLayout>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return { x: parsed.x, y: parsed.y, open: parsed.open !== false }
  } catch {
    return null
  }
}

function clampToViewport(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const maxX = Math.max(EDGE, window.innerWidth - width - EDGE)
  const maxY = Math.max(EDGE, window.innerHeight - height - EDGE)
  return {
    x: Math.min(maxX, Math.max(EDGE, x)),
    y: Math.min(maxY, Math.max(EDGE, y)),
  }
}

/**
 * A floating iOS-style calculator for quick bitrate and savings arithmetic.
 * Draggable by its title bar, minimisable, and fully usable from the keyboard.
 */
export function FloatingCalculator() {
  const stored = useRef<StoredLayout | null>(null)
  if (stored.current === null) stored.current = readLayout()

  // Open on first visit so the widget is discoverable; minimising is remembered.
  const [open, setOpen] = useState(stored.current?.open ?? true)
  const [calc, setCalc] = useState<CalcState>(initialCalcState)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    stored.current ? { x: stored.current.x, y: stored.current.y } : null,
  )
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const persist = useCallback((next: { x: number; y: number; open: boolean }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) // privacy:ok x/y/open only, no media
    } catch {
      /* private mode — position is simply not remembered */
    }
  }, [])

  useLayoutEffect(() => {
    setPosition((current) =>
      current ?? { x: window.innerWidth - PANEL_WIDTH - 24, y: Math.max(EDGE, window.innerHeight - 560) },
    )
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => {
        if (!current) return current
        const size = panelRef.current?.getBoundingClientRect()
        return clampToViewport(current.x, current.y, size?.width ?? PANEL_WIDTH, size?.height ?? 520)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const tap = useCallback((key: CalcKey) => {
    setCalc((current) => press(current, key))
  }, [])

  // Global keys while the panel is open, so the calculator works without aiming
  // at it — but never while a form field has focus.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        persist({ open: false, ...(position ?? { x: EDGE, y: EDGE }) })
        return
      }
      const mapped = keyFromEvent(event)
      if (!mapped) return
      if (mapped === 'divide') event.preventDefault() // '/' is Firefox quick-find
      tap(mapped)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, persist, position, tap])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !position) return
    dragState.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag) return
    const size = panelRef.current?.getBoundingClientRect()
    setPosition(
      clampToViewport(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
        size?.width ?? PANEL_WIDTH,
        size?.height ?? 520,
      ),
    )
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (position) persist({ ...position, open })
  }

  if (!position) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          persist({ ...position, open: true })
        }}
        style={{ left: position.x + PANEL_WIDTH - 56, top: position.y }}
        className="fixed z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-dock transition-transform hover:scale-105"
        aria-label="Open the calculator"
      >
        <CalculatorIcon className="h-6 w-6" />
      </button>
    )
  }

  const value = display(calc)
  const fontSize = value.length > 12 ? 22 : value.length > 9 ? 28 : value.length > 7 ? 34 : 40
  const activeOp = calc.pendingOp

  return (
    <div
      ref={panelRef}
      style={{ left: position.x, top: position.y, width: PANEL_WIDTH }}
      role="region"
      aria-label="Calculator"
      className="fixed z-40 overflow-hidden rounded-[28px] border border-line bg-surface shadow-dock animate-pop-in"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex cursor-grab touch-none items-center justify-between px-4 pb-2 pt-3 active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-ink-3">
          <CalculatorIcon className="h-3.5 w-3.5" />
          Calculator
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              persist({ ...position, open: false })
            }}
            aria-expanded
            className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Minimise the calculator"
          >
            <ChevronIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCalc(initialCalcState)}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Reset the calculator"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <output
        aria-live="polite"
        aria-atomic="true"
        className="tnum block w-full truncate px-5 pb-3 text-right font-mono text-ink"
        style={{ fontSize }}
      >
        {value}
      </output>

      <div className="grid grid-cols-4 gap-2 bg-surface-2/60 p-3" onKeyDown={(event: ReactKeyboardEvent) => event.stopPropagation()}>
        {KEYS.map((row, rowIndex) =>
          row.map((definition) => {
            const label = KEY_NAMES[definition.key] ?? `digit ${definition.key}`
            const isActiveOp = definition.tone === 'op' && activeOp === definition.key
            return (
              <button
                key={`${rowIndex}-${definition.key}`}
                type="button"
                onClick={() => tap(definition.key)}
                aria-label={label}
                aria-pressed={definition.tone === 'op' ? isActiveOp : undefined}
                style={definition.span === 2 ? { gridColumn: 'span 2' } : undefined}
                className={`h-14 rounded-full text-[17px] font-medium transition-colors ${
                  definition.tone === 'op'
                    ? isActiveOp
                      ? 'bg-accent-soft text-accent ring-2 ring-accent'
                      : 'bg-accent text-accent-ink hover:bg-accent-hover'
                    : definition.tone === 'fn'
                      ? 'bg-surface-3 text-ink hover:bg-line-strong'
                      : 'bg-bg text-ink hover:bg-surface-2'
                } ${definition.span === 2 ? 'text-left pl-6' : ''}`}
              >
                {definition.key === 'clear' ? clearLabel(calc) : keySymbol(definition.key)}
              </button>
            )
          }),
        )}
      </div>

      <p className="bg-surface-2/60 px-4 pb-3 text-2xs leading-relaxed text-ink-3">
        Number keys, + − * / and Enter work while this panel is open. Escape closes it.
      </p>
    </div>
  )
}
