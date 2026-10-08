import { forwardRef } from "react"

interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  focusColor?: string
  maxLength?: number
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
      maxLength,
      ...rest
    },
    ref,
  ) => {
    let focusStyles: string
    if (focusColor.includes("red")) {
      focusStyles = "focus:border-red-500/50"
    } else if (focusColor.includes("amber")) {
      focusStyles = "focus:border-amber-400/80"
    } else if (focusColor.includes("cyan")) {
      focusStyles = "focus:border-cyan-400/50"
    } else {
      focusStyles = "focus:border-white/25"
    }

    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={`w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-3 text-sm leading-normal font-medium text-white transition-all duration-300 outline-none placeholder:font-normal placeholder:text-white/35 focus:bg-[rgba(28,35,44,0.82)] ${focusStyles} ${className}`}
        {...rest}
      />
    )
  },
)

FormInput.displayName = "FormInput"
