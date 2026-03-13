import { forwardRef } from "react"

interface FormInputProps {
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  focusColor?: string
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      type = "text",
      value,
      onChange,
      onKeyDown,
      placeholder,
      disabled = false,
      className = "",
      focusColor = "border-white/20",
    },
    ref,
  ) => {
    const focusStyles =
      focusColor.includes("amber") ? "focus:border-amber-500/30 focus:ring-amber-500/10"
      : focusColor.includes("red") ? "focus:border-red-500/30 focus:ring-red-500/10"
      : "focus:border-cyan-500/30 focus:ring-cyan-500/10"

    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:bg-white/10 focus:ring-4 ${focusStyles} ${className}`}
      />
    )
  },
)

FormInput.displayName = "FormInput"
