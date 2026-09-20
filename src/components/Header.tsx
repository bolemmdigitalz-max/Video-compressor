import { ImageIcon, MoonIcon, SunIcon, VideoIcon } from '@/components/Icons'
import type { MediaKind } from '@/types/media'
import type { ThemeApi } from '@/hooks/useTheme'

interface HeaderProps {
  product: MediaKind
  onProductChange: (kind: MediaKind) => void
  theme: ThemeApi
  engineLabel: string
}

export function Header({ product, onProductChange, theme, engineLabel }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/92 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-mono text-[15px] font-bold text-accent-ink"
          >
            C
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight text-ink">Compressly</p>
            <p className="text-2xs text-ink-3">runs on this device</p>
          </div>
        </div>

        <nav aria-label="Compressor" className="order-3 w-full sm:order-none sm:ml-4 sm:w-auto">
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            <ProductTab
              active={product === 'image'}
              onClick={() => onProductChange('image')}
              icon={<ImageIcon />}
              label="Images"
            />
            <ProductTab
              active={product === 'video'}
              onClick={() => onProductChange('video')}
              icon={<VideoIcon />}
              label="Videos"
            />
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="chip hidden md:inline-flex" title="ffmpeg-core build used for video">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {engineLabel}
          </span>
          <button
            type="button"
            onClick={theme.toggle}
            className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-pressed={theme.theme === 'dark'}
            title={theme.theme === 'dark' ? 'Switch to the light palette' : 'Switch to the dark palette'}
          >
            <span className="sr-only">
              {theme.theme === 'dark' ? 'Switch to the light palette' : 'Switch to the dark palette'}
            </span>
            {theme.theme === 'dark' ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </header>
  )
}

function ProductTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors sm:flex-none ${
        active ? 'bg-accent text-accent-ink shadow-card' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
