import React from 'react'

export interface SwitchProps {
  /**
   * Defines the checked state of the switch toggle.
   */
  checked?: boolean
  /**
   * Fires when the toggle state is flipped by the user.
   */
  onChange: (checked: boolean) => void
  /**
   * Toggles the disabled behavior, disabling interactions.
   */
  disabled?: boolean
  /**
   * An optional accessible label for screen readers.
   */
  ariaLabel?: string
  /**
   * Identifies the element(s) that label the switch.
   */
  ariaLabelledBy?: string
  /**
   * Optional custom child components (e.g., locks, indicators) inside the thumb.
   */
  children?: React.ReactNode
}

/**
 * Accessible switch toggle component.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  children
}: SwitchProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange(!checked)
    }
  }

  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={handleKeyDown}
      className={`premium-switch focus-visible:ring-offset-background group/toggle focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
        checked ? 'premium-switch-on' : 'premium-switch-off'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <div
        className={`premium-switch-thumb ${
          checked ? 'premium-switch-thumb-on' : 'premium-switch-thumb-off'
        } flex items-center justify-center`}>
        {children}
      </div>
    </button>
  )
}
