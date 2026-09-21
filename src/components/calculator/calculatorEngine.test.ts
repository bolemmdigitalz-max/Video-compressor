import { describe, expect, it } from 'vitest'
import {
  clearLabel,
  display,
  evaluate,
  formatNumber,
  initialCalcState,
  keyFromEvent,
  keySymbol,
  press,
} from './calculatorEngine'
import type { CalcKey } from './calculatorEngine'

const run = (keys: readonly CalcKey[]): string => display(evaluate(keys))
const chars = (text: string): CalcKey[] =>
  [...text].map((char) => {
    if (char >= '0' && char <= '9') return char as CalcKey
    switch (char) {
      case '.':
        return '.'
      case '+':
        return 'add'
      case '-':
        return 'subtract'
      case '×':
        return 'multiply'
      case '÷':
        return 'divide'
      case '=':
        return 'equals'
      case '%':
        return 'percent'
      case 'C':
        return 'clear'
      case '±':
        return 'negate'
      default:
        throw new Error(`unmapped test key ${char}`)
    }
  })
const type = (text: string): string => run(chars(text))

describe('digit entry', () => {
  it('starts at zero', () => {
    expect(display(initialCalcState)).toBe('0')
  })

  it('replaces a leading zero instead of appending to it', () => {
    expect(type('007')).toBe('7')
  })

  it('groups thousands with commas', () => {
    expect(type('1234567')).toBe('1,234,567')
  })

  it('stops at nine digits like the iOS calculator', () => {
    expect(type('1234567890123')).toBe('123,456,789')
  })

  it('keeps a trailing decimal point visible', () => {
    expect(type('12.')).toBe('12.')
    expect(type('0.')).toBe('0.')
  })

  it('ignores a second decimal point', () => {
    expect(type('1.2.3')).toBe('1.23')
  })
})

describe('arithmetic', () => {
  it('adds', () => {
    expect(type('7+8=')).toBe('15')
  })

  it('subtracts, multiplies and divides', () => {
    expect(type('20-8=')).toBe('12')
    expect(type('6×7=')).toBe('42')
    expect(type('144÷12=')).toBe('12')
  })

  it('applies operations left to right with no precedence', () => {
    // iOS: 2+3=5, then ×4=20. Not 2+(3×4)=14.
    expect(type('2+3×4=')).toBe('20')
  })

  it('chains a pending operation when another operator is pressed', () => {
    expect(type('10+5-3=')).toBe('12')
  })

  it('repeats the last operation on every further equals press', () => {
    expect(type('2+3=')).toBe('5')
    expect(type('2+3==')).toBe('8')
    expect(type('2+3===')).toBe('11')
  })

  it('shows the running total when an operator is pending', () => {
    expect(type('5+5+')).toBe('10')
  })
})

describe('division by zero', () => {
  it('latches Error', () => {
    expect(type('5÷0=')).toBe('Error')
  })

  it('ignores every key except clear while in Error', () => {
    let state = evaluate(chars('5÷0='))
    state = press(state, '7')
    expect(display(state)).toBe('Error')
    state = press(state, 'clear')
    expect(display(state)).toBe('0')
  })
})

describe('clear', () => {
  it('reads C while an entry is open and AC once it is cleared', () => {
    let state = evaluate(chars('12'))
    expect(clearLabel(state)).toBe('C')
    state = press(state, 'clear')
    expect(clearLabel(state)).toBe('AC')
    expect(display(state)).toBe('0')
  })

  it('clears the entry first, then the accumulator', () => {
    let state = evaluate(chars('9+'))
    state = press(state, '5')
    expect(display(state)).toBe('5')
    state = press(state, 'clear')
    expect(display(state)).toBe('9')
    state = press(state, 'clear')
    expect(display(state)).toBe('0')
  })
})

describe('sign and percent', () => {
  it('negates the entry', () => {
    expect(type('5±')).toBe('-5')
    expect(type('5±±')).toBe('5')
  })

  it('negates the stored total', () => {
    let state = evaluate(chars('4+4='))
    state = press(state, 'negate')
    expect(display(state)).toBe('-8')
  })

  it('divides by 100 on its own', () => {
    expect(type('50%')).toBe('0.5')
  })

  it('reads percent as a share of the running total after + or −', () => {
    // iOS: 200 + 10% = 200 + 20 = 220
    expect(type('200+10%=')).toBe('220')
  })
})

describe('formatNumber', () => {
  it('switches to scientific notation past nine digits', () => {
    expect(formatNumber(1_234_567_890)).toBe('1.2345679e9')
    expect(formatNumber(0.0000000012)).toBe('1.2e-9')
  })

  it('prints zero plainly', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('reports Error for a non-finite value', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('Error')
    expect(formatNumber(Number.NaN)).toBe('Error')
  })

  it('trims trailing zeros from a computed result', () => {
    expect(formatNumber(0.30000000000000004)).toBe('0.3')
    expect(formatNumber(15)).toBe('15')
  })
})

describe('keySymbol', () => {
  it('renders operator glyphs', () => {
    expect(keySymbol('multiply')).toBe('×')
    expect(keySymbol('divide')).toBe('÷')
    expect(keySymbol('subtract')).toBe('−')
    expect(keySymbol('equals')).toBe('=')
    expect(keySymbol('7')).toBe('7')
  })
})

describe('keyFromEvent', () => {
  it('maps the physical keyboard onto the keypad', () => {
    expect(keyFromEvent({ key: '5' })).toBe('5')
    expect(keyFromEvent({ key: '+' })).toBe('add')
    expect(keyFromEvent({ key: '-' })).toBe('subtract')
    expect(keyFromEvent({ key: '*' })).toBe('multiply')
    expect(keyFromEvent({ key: '/' })).toBe('divide')
    expect(keyFromEvent({ key: 'Enter' })).toBe('equals')
    expect(keyFromEvent({ key: 'Backspace' })).toBe('clear')
    expect(keyFromEvent({ key: 'Escape' })).toBe('clear')
    expect(keyFromEvent({ key: ',' })).toBe('.')
  })

  it('ignores keys the calculator does not have', () => {
    expect(keyFromEvent({ key: 'q' })).toBeNull()
    expect(keyFromEvent({ key: 'Shift' })).toBeNull()
  })
})
