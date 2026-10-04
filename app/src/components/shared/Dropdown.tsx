import { useState, useEffect, useRef, forwardRef, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Tooltip } from "@/components/shared/Tooltip"

export interface DropdownOption<T = string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
  dividerBelow?: boolean
  icon?: string | React.ReactNode
}

interface DropdownProps<T = string> extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: DropdownOption<T>[]
  value: T | null | undefined
  onChange: (value: T | null) => void
  placeholder?: string
  emptyMessage?: string
  className?: string
  buttonClassName?: string
  optionClassName?: string
  iconClassName?: string
  disabled?: boolean
  maxHeight?: number // in pixels
  showPlaceholderOption?: boolean
  allowClear?: boolean // Allow selecting placeholder to clear value
  trigger?: React.ReactNode
  menuWidth?: number | string
  align?: "left" | "right" | "center"
  alignToSelector?: string
  onOpenChange?: (isOpen: boolean) => void
}

export const Dropdown = forwardRef<HTMLDivElement, DropdownProps<string | number>>(
  (
    {
      options,
      value,
      onChange,
      placeholder = "Select...",
      emptyMessage = "No options available",
      className = "",
      buttonClassName = "",
      optionClassName = "",
      iconClassName = "",
      disabled = false,
      maxHeight = 256,
      showPlaceholderOption = true,
      allowClear = true,
      trigger,
      menuWidth,
      align,
      alignToSelector,
      onOpenChange,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false)

    // Notify parent safely of open state changes in an effect to avoid render-phase state updates!
    const lastOpenRef = useRef(isOpen)
    useEffect(() => {
      if (lastOpenRef.current !== isOpen) {
        lastOpenRef.current = isOpen
        onOpenChange?.(isOpen)
      }
    }, [isOpen, onOpenChange])
    const [menuPosition, setMenuPosition] = useState<{
      top: number
      left: number
      width: number
      buttonRight: number
      opensUp: boolean
      parentLeft?: number
      parentWidth?: number
    } | null>(null)
    const internalRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Combine refs
    useEffect(() => {
      if (!ref) return
      if (typeof ref === "function") {
        ref(internalRef.current)
      } else {
        ;(ref as React.MutableRefObject<HTMLDivElement | null>).current = internalRef.current
      }
    }, [ref])

    const selectedOption = options.find((opt) => opt.value === value)
    const displayText = selectedOption?.label || placeholder
    const shouldShowCustomTooltip = (text: unknown) => typeof text === "string" && text.length > 24

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const isClickInsideTrigger =
          internalRef.current && internalRef.current.contains(event.target as Node)
        const isClickInsideMenu = menuRef.current && menuRef.current.contains(event.target as Node)

        if (!isClickInsideTrigger && !isClickInsideMenu) {
          setIsOpen(false)
        }
      }

      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside)
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }, [isOpen])

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) {
          e.stopImmediatePropagation()
          setIsOpen(false)
        }
      }
      window.addEventListener("keydown", handleEscape, true)
      return () => window.removeEventListener("keydown", handleEscape, true)
    }, [isOpen])

    const updateMenuPosition = useCallback(() => {
      if (!buttonRef.current) return

      const buttonRect = buttonRef.current.getBoundingClientRect()

      let parentRect = buttonRect
      if (alignToSelector) {
        const el =
          buttonRef.current.closest(alignToSelector) || document.querySelector(alignToSelector)
        if (el) {
          parentRect = el.getBoundingClientRect()
        }
      }

      const estimatedHeight = Math.min(
        maxHeight,
        options.length * 36 + (showPlaceholderOption && allowClear ? 44 : 0) + 12,
      )
      const measuredHeight = menuRef.current?.offsetHeight ?? estimatedHeight
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      const shouldOpenUp = spaceBelow < measuredHeight && spaceAbove > spaceBelow
      const viewportPadding = 8
      const gap = 4

      setMenuPosition({
        top:
          shouldOpenUp ?
            Math.max(viewportPadding, buttonRect.top - measuredHeight - gap)
          : Math.min(
              window.innerHeight - measuredHeight - viewportPadding,
              buttonRect.bottom + gap,
            ),
        left: buttonRect.left,
        width: buttonRect.width,
        buttonRight: buttonRect.right,
        opensUp: shouldOpenUp,
        parentLeft: parentRect.left,
        parentWidth: parentRect.width,
      })
    }, [allowClear, maxHeight, options.length, showPlaceholderOption, alignToSelector])

    useLayoutEffect(() => {
      if ((!isOpen && !menuRef.current) || !buttonRef.current) return

      updateMenuPosition()

      // High-performance animation frame synchronizer to track fluid layout shifts/transitions
      let animFrameId: number
      let lastRect = { left: 0, top: 0, width: 0 }

      const checkPosition = () => {
        if (!buttonRef.current) return
        const rect = buttonRef.current.getBoundingClientRect()
        if (
          rect.left !== lastRect.left ||
          rect.top !== lastRect.top ||
          rect.width !== lastRect.width
        ) {
          lastRect = { left: rect.left, top: rect.top, width: rect.width }
          updateMenuPosition()
        }
        animFrameId = requestAnimationFrame(checkPosition)
      }

      animFrameId = requestAnimationFrame(checkPosition)

      const handleViewportChange = () => updateMenuPosition()
      window.addEventListener("resize", handleViewportChange)
      window.addEventListener("scroll", handleViewportChange, true)

      return () => {
        cancelAnimationFrame(animFrameId)
        window.removeEventListener("resize", handleViewportChange)
        window.removeEventListener("scroll", handleViewportChange, true)
      }
    }, [isOpen, updateMenuPosition])

    const handleSelect = (optionValue: string | number) => {
      const option = options.find((opt) => opt.value === optionValue)
      if (!option?.disabled) {
        onChange(optionValue)
        setIsOpen(false)
      }
    }

    const handleToggle = () => {
      if (disabled) return
      if (!isOpen) {
        updateMenuPosition()
      }
      setIsOpen(!isOpen)
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { onDrag, onDragStart, onDragEnd, onAnimationStart, ...cleanProps } = props
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return (
      <motion.div
        layout
        className={`relative min-w-0 ${className}`}
        ref={internalRef}
        {...cleanProps}>
        {trigger ?
          <motion.div
            layout
            ref={buttonRef as React.RefObject<HTMLDivElement | null>}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggle}
            className={`flex min-w-0 cursor-pointer items-center justify-between focus:outline-none ${
              (
                trigger &&
                (buttonClassName.includes("bg-transparent") || buttonClassName.includes("border-0"))
              ) ?
                "justify-center border-0 bg-transparent p-0 hover:bg-transparent focus:bg-transparent"
              : "w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left text-sm text-white transition-all hover:border-white/10 hover:bg-white/[0.08] focus:border-white/20 focus:bg-white/[0.08]"
            } ${buttonClassName} `}>
            {trigger}
          </motion.div>
        : <Tooltip
            content={displayText}
            offset={4}
            disabled={!shouldShowCustomTooltip(displayText)}
            className="!px-2.5 !py-1.5 text-center break-all">
            <motion.button
              layout
              type="button"
              ref={buttonRef as React.RefObject<HTMLButtonElement | null>}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggle}
              disabled={disabled}
              className={`flex min-w-0 cursor-pointer items-center justify-between focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                (
                  trigger &&
                  (buttonClassName.includes("bg-transparent") ||
                    buttonClassName.includes("border-0"))
                ) ?
                  "justify-center border-0 bg-transparent p-0 hover:bg-transparent focus:bg-transparent"
                : "dropdown-trigger w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/10 hover:bg-white/[0.08] focus:border-white/20 focus:bg-white/[0.08]"
              } ${buttonClassName} `}>
              <motion.span layout="position" className="min-w-0 flex-1 truncate text-left">
                {displayText}
              </motion.span>
              <motion.span
                layout="position"
                className="ms-3 flex h-4 w-[10px] shrink-0 items-center justify-center">
                <i
                  className={`fa-solid fa-chevron-down text-xs text-white/65 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  } ${iconClassName}`}></i>
              </motion.span>
            </motion.button>
          </Tooltip>
        }

        {createPortal(
          <AnimatePresence>
            {isOpen && !disabled && (
              <>
                <motion.div
                  ref={menuRef}
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="fixed z-9999 overflow-hidden rounded-lg border border-white/10 bg-[#0f1319] shadow-2xl backdrop-blur-md"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    top: menuPosition ? `${menuPosition.top}px` : "-9999px",
                    left:
                      align === "left" || (!align && !menuWidth) ?
                        menuPosition ? `${menuPosition.left}px`
                        : "0px"
                      : align === "center" ?
                        menuPosition ?
                          (() => {
                            const w =
                              typeof menuWidth === "number" ? menuWidth : (
                                (menuRef.current?.offsetWidth ?? menuPosition.width)
                              )
                            const baseLeft =
                              menuPosition.parentLeft !== undefined ?
                                menuPosition.parentLeft
                              : menuPosition.left
                            const baseWidth =
                              menuPosition.parentWidth !== undefined ?
                                menuPosition.parentWidth
                              : menuPosition.width
                            return `${baseLeft + (baseWidth - w) / 2}px`
                          })()
                        : "0px"
                      : undefined,
                    right:
                      align === "right" || (!align && menuWidth) ?
                        menuPosition ? `${window.innerWidth - menuPosition.buttonRight}px`
                        : "0px"
                      : undefined,
                    width:
                      menuWidth ?
                        typeof menuWidth === "number" ?
                          `${menuWidth}px`
                        : menuWidth
                      : menuPosition ? `${menuPosition.width}px`
                      : undefined,
                    transformOrigin:
                      menuPosition?.opensUp ?
                        align === "center" ? "bottom center"
                        : align === "left" || (!align && !menuWidth) ? "bottom left"
                        : "bottom right"
                      : align === "center" ? "top center"
                      : align === "left" || (!align && !menuWidth) ? "top left"
                      : "top right",
                    visibility: menuPosition ? "visible" : "hidden",
                  }}>
                  <div
                    className="custom-scroll overflow-y-auto"
                    style={{ maxHeight: `${maxHeight}px` }}>
                    {options.length === 0 ?
                      <div className="px-3 py-2 text-center text-[11px] font-medium text-white/55">
                        {emptyMessage}
                      </div>
                    : <>
                        {showPlaceholderOption && allowClear && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onChange(null)
                                setIsOpen(false)
                              }}
                              className={`w-full rounded-none px-3 py-1.5 text-left text-xs transition-colors ${
                                !value ?
                                  "bg-cyan-500/10 font-semibold text-cyan-400"
                                : "text-white/70 hover:bg-white/5 hover:text-white"
                              } ${optionClassName}`}>
                              {placeholder}
                            </button>
                            {options.length > 0 && <div className="mx-2 h-px bg-white/5"></div>}
                          </>
                        )}

                        {options.map((option, idx) => (
                          <div key={option.value !== "" ? String(option.value) : `empty-${idx}`}>
                            <Tooltip
                              content={typeof option.label === "string" ? option.label : undefined}
                              offset={4}
                              disabled={!shouldShowCustomTooltip(option.label)}
                              className="!px-2.5 !py-1.5 text-center break-all">
                              <button
                                type="button"
                                onClick={() => handleSelect(option.value)}
                                disabled={option.disabled}
                                className={`flex w-full items-center gap-2 truncate rounded-none px-3 py-1.5 text-left text-xs transition-colors ${
                                  value === option.value ?
                                    "bg-cyan-500/10 font-semibold text-cyan-400"
                                  : option.disabled ? "cursor-not-allowed text-white/55"
                                  : "text-white/70 hover:bg-white/5 hover:text-white"
                                } ${optionClassName}`}>
                                {option.icon && (
                                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-xs opacity-75">
                                    {typeof option.icon === "string" ?
                                      <i className={option.icon} />
                                    : option.icon}
                                  </span>
                                )}
                                <span className="block flex-1 truncate">{option.label}</span>
                              </button>
                            </Tooltip>
                            {option.dividerBelow && <div className="mx-2 my-1 h-px bg-white/5" />}
                          </div>
                        ))}
                      </>
                    }
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </motion.div>
    )
  },
)

Dropdown.displayName = "Dropdown"
