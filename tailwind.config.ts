import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--c-surface-3) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--c-ink-3) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        gain: 'rgb(var(--c-gain) / <alpha-value>)',
        loss: 'rgb(var(--c-loss) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.06), 0 1px 1px rgb(var(--c-shadow) / 0.04)',
        lift: '0 12px 32px -8px rgb(var(--c-shadow) / 0.22), 0 2px 6px rgb(var(--c-shadow) / 0.08)',
        dock: '0 24px 60px -12px rgb(var(--c-shadow) / 0.45), 0 4px 14px rgb(var(--c-shadow) / 0.18)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        stripe: {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '28px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
        'pop-in': 'pop-in 160ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
        stripe: 'stripe 900ms linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
