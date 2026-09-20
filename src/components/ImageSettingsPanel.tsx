import { Disclosure, Field, RangeField, SelectField, SwitchField } from '@/components/ui/primitives'
import { formatPercent } from '@/utils/format'
import type { EncodableMimeName, ImageOutputFormat, ImageSettings } from '@/types/media'

interface Props {
  settings: ImageSettings
  encodable: readonly EncodableMimeName[]
  hasTransparentSource: boolean
  onChange: (patch: Partial<ImageSettings>) => void
}

const RESIZE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'keep', label: 'Keep source size' },
  { value: '3840', label: '3840 px longest edge' },
  { value: '2560', label: '2560 px longest edge' },
  { value: '1920', label: '1920 px longest edge' },
  { value: '1280', label: '1280 px longest edge' },
  { value: '1024', label: '1024 px longest edge' },
  { value: '768', label: '768 px longest edge' },
]

function formatOptions(encodable: readonly EncodableMimeName[]) {
  const options: { value: ImageOutputFormat; label: string; disabled: boolean }[] = [
    { value: 'keep', label: 'Same as source', disabled: false },
    { value: 'jpeg', label: 'JPEG — no transparency', disabled: !encodable.includes('image/jpeg') },
    { value: 'webp', label: 'WebP', disabled: !encodable.includes('image/webp') },
    { value: 'avif', label: 'AVIF', disabled: !encodable.includes('image/avif') },
    { value: 'png', label: 'PNG — lossless', disabled: !encodable.includes('image/png') },
  ]
  return options.map((option) => ({
    value: option.value,
    label: option.disabled ? `${option.label} (not supported here)` : option.label,
    disabled: option.disabled,
  }))
}

export function ImageSettingsPanel({ settings, encodable, hasTransparentSource, onChange }: Props) {
  const lossless = settings.format === 'png'
  const avifMissing = !encodable.includes('image/avif')

  return (
    <div className="space-y-4">
      <SelectField
        label="Output format"
        value={settings.format}
        options={formatOptions(encodable)}
        hint={
          avifMissing
            ? 'AVIF encoding is not available in this browser, so it is greyed out rather than offered.'
            : 'PNG ignores the quality control because it is lossless.'
        }
        onChange={(value) => onChange({ format: value as ImageOutputFormat })}
      />

      <RangeField
        label="Quality"
        value={Math.round(settings.quality * 100)}
        min={5}
        max={100}
        valueLabel={lossless ? 'lossless' : formatPercent(settings.quality * 100)}
        disabled={lossless}
        hint={
          lossless
            ? 'PNG stores every pixel exactly, so there is no quality trade to make.'
            : 'Lower values shrink the file and soften fine detail.'
        }
        onChange={(value) => onChange({ quality: value / 100 })}
      />

      <SelectField
        label="Resize"
        value={settings.maxDimensionPx === null ? 'keep' : String(settings.maxDimensionPx)}
        options={RESIZE_OPTIONS}
        hint="Images already smaller than the cap are left at their original size."
        onChange={(value) =>
          onChange({ maxDimensionPx: value === 'keep' ? null : Number(value) })
        }
      />

      <SwitchField
        label="Protect transparency"
        checked={settings.keepTransparency}
        hint={
          hasTransparentSource
            ? 'A transparent source in this batch will be written as PNG or WebP, never flattened into JPEG.'
            : 'When off, transparent pixels are filled with the colour below before encoding to JPEG.'
        }
        onChange={(checked) => onChange({ keepTransparency: checked })}
      />

      {settings.keepTransparency ? null : (
        <Field label="Flatten onto" hint="Used only for sources that actually have transparent pixels.">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.flattenBackground}
              onChange={(event) => onChange({ flattenBackground: event.target.value })}
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-bg p-1"
              aria-label="Flatten background colour"
            />
            <code className="tnum font-mono text-[13px] text-ink-2">{settings.flattenBackground}</code>
          </div>
        </Field>
      )}

      <Disclosure label="What the encoder will do">
        <ul className="space-y-2 text-[13px] text-ink-2">
          <li>
            Decode with <code className="font-mono text-2xs">createImageBitmap</code> inside a worker thread.
          </li>
          <li>
            Resize with high-quality smoothing, longest edge capped at{' '}
            {settings.maxDimensionPx === null ? 'the source size' : `${settings.maxDimensionPx} px`}.
          </li>
          <li>
            Encode to {settings.format === 'keep' ? 'the source format' : settings.format.toUpperCase()}
            {lossless ? '' : ` at quality ${Math.round(settings.quality * 100)}`}.
          </li>
          <li>Close the bitmap and terminate the worker as soon as the blob is written.</li>
        </ul>
      </Disclosure>
    </div>
  )
}
