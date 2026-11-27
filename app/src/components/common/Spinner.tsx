import type { JSX } from 'react'

/**
 * Properties for the Spinner component.
 */
interface SpinnerProps {
  /** The size preset of the spinner */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** The color theme of the spinner */
  color?: 'cyan' | 'white' | 'muted'
  /** Additional Tailwind CSS classes to customize positioning or styling */
  className?: string
}

const sizeClasses = {
  xs: 'h-3.5 w-3.5 border-2',
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
  xl: 'h-16 w-16 border-4'
}

const colorClasses = {
  cyan: {
    bg: 'border-cyan-500/10',
    fg: 'border-cyan-500 border-t-transparent'
  },
  white: {
    bg: 'border-white/10',
    fg: 'border-white border-t-transparent'
  },
  muted: {
    bg: 'border-white/5',
    fg: 'border-white/40 border-t-transparent'
  }
}

/**
 * Animated spinner component for loading states.
 */
export function Spinner({ size = 'md', color = 'cyan', className = '' }: SpinnerProps): JSX.Element {
  const sizeStyle = sizeClasses[size]
  const colorTheme = colorClasses[color]

  return (
    <div className={`relative shrink-0 select-none ${className}`}>
      {/* Background Track Ring */}
      <div className={`absolute inset-0 rounded-full border ${sizeStyle} ${colorTheme.bg}`} />
      {/* Spinning Active Ring */}
      <div className={`animate-spin rounded-full border ${sizeStyle} ${colorTheme.fg}`} />
    </div>
  )
}
