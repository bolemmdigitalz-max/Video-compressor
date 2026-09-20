import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ChevronIcon } from '@/components/Icons'

interface FieldProps {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, htmlFor, children, className = '' }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor ?? id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

interface RangeFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Rendered verbatim next to the label, e.g. "24 · high". */
  valueLabel: string
  hint?: ReactNode
  disabled?: boolean
  onChange: (value: number) => void
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  valueLabel,
  hint,
  disabled = false,
  onChange,
}: RangeFieldProps) {
  const id = useId()
  const handle = (event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="text-[13px] font-medium text-ink-2" htmlFor={id}>
          {label}
        </label>
        <span className="tnum font-mono text-[13px] text-ink">{valueLabel}</span>
      </div>
      <input
        id={id}
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={handle}
        aria-valuetext={valueLabel}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  options: readonly { value: string; label: string; disabled?: boolean }[]
  hint?: ReactNode
  disabled?: boolean
  onChange: (value: string) => void
}

export function SelectField({ label, value, options, hint, disabled = false, onChange }: SelectFieldProps) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <select
          id={id}
          className="control appearance-none pr-9"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      </div>
    </Field>
  )
}

interface SwitchFieldProps {
  label: string
  checked: boolean
  hint?: ReactNode
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function SwitchField({ label, checked, hint, disabled = false, onChange }: SwitchFieldProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label className="block text-[13px] font-medium text-ink-2" htmlFor={id}>
          {label}
        </label>
        {hint ? <p className="field-hint">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3'
        }`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-bg shadow-card transition-all ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string; description?: string }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value)
    if (index < 0) return
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    else return

    event.preventDefault()
    const target = options[next]
    if (!target) return
    onChange(target.value)
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[next]?.focus()
  }

  return (
    <div>
      <span className="field-label" id={`${label.replace(/\s+/g, '-').toLowerCase()}-group`}>
        {label}
      </span>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={`${label.replace(/\s+/g, '-').toLowerCase()}-group`}
        onKeyDown={onKeyDown}
        className="flex gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`flex-1 rounded-md font-medium transition-colors ${
                size === 'sm' ? 'min-h-9 px-2.5 text-[13px]' : 'min-h-10 px-3 text-sm'
              } ${
                selected
                  ? 'bg-accent text-accent-ink shadow-card'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface DisclosureProps {
  label: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Disclosure({ label, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        {label}
        <ChevronIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div id={id} className="mt-3 space-y-4 animate-fade-up">
          {children}
        </div>
      ) : null}
    </div>
  )
}

interface ProgressBarProps {
  ratio: number
  label: string
  /** Announce changes to screen readers without spamming on every frame. */
  state: 'idle' | 'active' | 'done' | 'failed' | 'cancelled'
}

export function ProgressBar({ ratio, label, state }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  const tone =
    state === 'failed' ? 'bg-loss' : state === 'cancelled' ? 'bg-ink-3' : state === 'done' ? 'bg-gain' : 'bg-accent'

  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${tone} ${
            state === 'active' ? 'progress-active animate-stripe' : ''
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-2xs text-ink-3">{label}</p>
    </div>
  )
}
