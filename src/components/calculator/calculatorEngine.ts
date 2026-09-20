/**
 * iOS calculator arithmetic, including the parts people do not expect:
 * - operations apply left to right, with no precedence
 * - `=` repeats the last operation with the same operand
 * - `%` after `+` or `−` is a percentage *of the running total*
 * - dividing by zero latches an Error that only AC clears
 */

export type BinaryOp = 'add' | 'subtract' | 'multiply' | 'divide'

export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | 'add' | 'subtract' | 'multiply' | 'divide' | 'equals'
  | 'clear' | 'negate' | 'percent'

export interface CalcState {
  /** Literal digits being typed, or null when the display shows the accumulator. */
  entry: string | null
  accumulator: number | null
  pendingOp: BinaryOp | null
  lastOp: BinaryOp | null
  lastOperand: number | null
  error: boolean
}

export const initialCalcState: CalcState = {
  entry: null,
  accumulator: null,
  pendingOp: null,
  lastOp: null,
  lastOperand: null,
  error: false,
}

const MAX_DIGITS = 9
const SCIENTIFIC_ABOVE = 1e9
const SCIENTIFIC_BELOW = 1e-9

function isDigit(key: CalcKey): key is '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' {
  return key >= '0' && key <= '9'
}

function digitCount(entry: string): number {
  return entry.replace(/[-.]/g, '').replace(/^0+(?=\d)/, '').length
}

function currentValue(state: CalcState): number {
  if (state.entry !== null) {
    const parsed = Number.parseFloat(state.entry)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return state.accumulator ?? 0
}

function apply(op: BinaryOp, left: number, right: number): number | null {
  switch (op) {
    case 'add':
      return left + right
    case 'subtract':
      return left - right
    case 'multiply':
      return left * right
    case 'divide':
      return right === 0 ? null : left / right
    default:
      return left
  }
}

function failed(): CalcState {
  return { ...initialCalcState, error: true }
}

export function press(state: CalcState, key: CalcKey): CalcState {
  if (state.error && key !== 'clear') return state

  if (isDigit(key)) {
    if (state.entry === null) {
      return { ...state, entry: key === '0' ? '0' : key, accumulator: state.accumulator ?? null }
    }
    if (state.entry === '0') return { ...state, entry: key }
    if (digitCount(state.entry) >= MAX_DIGITS) return state
    return { ...state, entry: state.entry + key }
  }

  switch (key) {
    case '.': {
      if (state.entry === null) return { ...state, entry: '0.' }
      if (state.entry.includes('.')) return state
      if (digitCount(state.entry) >= MAX_DIGITS) return state
      return { ...state, entry: state.entry + '.' }
    }

    case 'clear': {
      // First press clears the entry (the "C" key), second press resets (the "AC" key).
      if (state.entry !== null) return { ...state, entry: null }
      return { ...initialCalcState }
    }

    case 'negate': {
      if (state.entry !== null) {
        const next = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`
        return { ...state, entry: next === '-' ? '0' : next }
      }
      const value = state.accumulator ?? 0
      return { ...state, accumulator: value === 0 ? 0 : -value }
    }

    case 'percent': {
      const value = currentValue(state)
      // After + or −, iOS reads 10% as 10% of the running total.
      if ((state.pendingOp === 'add' || state.pendingOp === 'subtract') && state.accumulator !== null) {
        const scaled = (state.accumulator * value) / 100
        return { ...state, entry: String(scaled), pendingOp: state.pendingOp }
      }
      return { ...state, entry: String(value / 100) }
    }

    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide': {
      const value = currentValue(state)
      if (state.pendingOp !== null && state.entry !== null && state.accumulator !== null) {
        const result = apply(state.pendingOp, state.accumulator, value)
        if (result === null || !Number.isFinite(result)) return failed()
        return { ...state, entry: null, accumulator: result, pendingOp: key }
      }
      return { ...state, entry: null, accumulator: value, pendingOp: key }
    }

    case 'equals': {
      if (state.pendingOp !== null) {
        const operand = state.entry !== null ? currentValue(state) : (state.accumulator ?? 0)
        const result = apply(state.pendingOp, state.accumulator ?? 0, operand)
        if (result === null || !Number.isFinite(result)) return failed()
        return {
          entry: null,
          accumulator: result,
          pendingOp: null,
          lastOp: state.pendingOp,
          lastOperand: operand,
          error: false,
        }
      }
      if (state.lastOp !== null && state.lastOperand !== null) {
        const result = apply(state.lastOp, state.accumulator ?? 0, state.lastOperand)
        if (result === null || !Number.isFinite(result)) return failed()
        return { ...state, entry: null, accumulator: result }
      }
      return state
    }

    default:
      return state
  }
}

/** Groups the integer part in threes and keeps a trailing decimal point visible. */
function groupInteger(intPart: string): string {
  const negative = intPart.startsWith('-')
  const digits = negative ? intPart.slice(1) : intPart
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Error'
  if (value === 0) return '0'

  const abs = Math.abs(value)
  if (abs >= SCIENTIFIC_ABOVE || abs < SCIENTIFIC_BELOW) {
    return value.toPrecision(8).replace(/\.?0+e/, 'e').replace('e+', 'e')
  }

  // Keep at most 9 significant digits, mirroring the iOS display limit.
  const text = Number(value.toPrecision(9)).toString()
  if (text.includes('e')) return text

  const [intPart, decPart] = text.split('.')
  const grouped = groupInteger(intPart ?? '0')
  return decPart ? `${grouped}.${decPart}` : grouped
}

export function display(state: CalcState): string {
  if (state.error) return 'Error'
  if (state.entry !== null) {
    const trailingDot = state.entry.endsWith('.')
    const [intPart, decPart] = state.entry.split('.')
    const grouped = groupInteger(intPart ?? '0')
    if (trailingDot) return `${grouped}.`
    return decPart === undefined ? grouped : `${grouped}.${decPart}`
  }
  return formatNumber(state.accumulator ?? 0)
}

/** True when the clear key should read "C" rather than "AC". */
export function clearLabel(state: CalcState): 'C' | 'AC' {
  return state.entry !== null ? 'C' : 'AC'
}

const KEY_SYMBOL: Record<string, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  equals: '=',
  clear: 'AC',
  negate: '⁄±',
  percent: '%',
}

export function keySymbol(key: CalcKey): string {
  return KEY_SYMBOL[key] ?? key
}

/** Maps a physical keyboard event to a calculator key. Returns null for keys we ignore. */
export function keyFromEvent(event: Pick<KeyboardEvent, 'key'>): CalcKey | null {
  if (event.key >= '0' && event.key <= '9') return event.key as CalcKey
  switch (event.key) {
    case '.':
    case ',':
      return '.'
    case '+':
      return 'add'
    case '-':
      return 'subtract'
    case '*':
    case 'x':
    case 'X':
      return 'multiply'
    case '/':
      return 'divide'
    case '=':
    case 'Enter':
      return 'equals'
    case '%':
      return 'percent'
    case 'Backspace':
    case 'Delete':
    case 'Escape':
      return 'clear'
    default:
      return null
  }
}

/** Convenience: type a whole expression, e.g. for tests and the keypad macro buttons. */
export function evaluate(keys: readonly CalcKey[]): CalcState {
  return keys.reduce(press, initialCalcState)
}
