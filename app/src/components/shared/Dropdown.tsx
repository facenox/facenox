import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Search } from "lucide-react"
import { Tooltip } from "@/components/shared/Tooltip"

export interface DropdownOption<T = string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
  dividerBelow?: boolean
  icon?: React.ReactNode
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
  trigger?: React.ReactNode // Non-interactive content inside the shared trigger button
  showChevron?: boolean
  menuWidth?: number | string
  align?: "left" | "right" | "center"
  alignToSelector?: string
  onOpenChange?: (isOpen: boolean) => void
  fit?: boolean
  ariaLabel?: string
  searchable?: boolean
  searchPlaceholder?: string
  searchAriaLabel?: string
  getOptionSearchText?: (option: DropdownOption<string | number>) => string
  maxVisibleOptions?: number
  renderOption?: (option: DropdownOption<string | number>, selected: boolean) => React.ReactNode
}

export const Dropdown = forwardRef<HTMLDivElement, DropdownProps<string | number>>(
  (
    {
      options,
      value,
      onChange,
      placeholder = "Select…",
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
      showChevron = true,
      menuWidth,
      align,
      alignToSelector,
      onOpenChange,
      fit = false,
      ariaLabel,
      searchable = false,
      searchPlaceholder = "Search options...",
      searchAriaLabel = "Search options",
      getOptionSearchText,
      maxVisibleOptions,
      renderOption,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Notify parent safely of open state changes in an effect to avoid render-phase state updates!
    const lastOpenRef = useRef(isOpen)
    useEffect(() => {
      if (lastOpenRef.current !== isOpen) {
        lastOpenRef.current = isOpen
        onOpenChange?.(isOpen)
      }
    }, [isOpen, onOpenChange])
    const [menuPosition, setMenuPosition] = useState<{
      top?: number
      bottom?: number
      left: number
      width: number
      buttonRight: number
      opensUp: boolean
      maxContentHeight: number
      parentLeft?: number
      parentWidth?: number
    } | null>(null)
    const pinnedOpensUpRef = useRef<boolean | null>(null)
    useEffect(() => {
      if (!isOpen) {
        pinnedOpensUpRef.current = null
      }
    }, [isOpen])
    const internalRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
    const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

    useEffect(() => {
      setHighlightedIndex(-1)
    }, [isOpen, searchQuery])

    useEffect(() => {
      if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
        optionRefs.current[highlightedIndex]?.scrollIntoView({
          block: "nearest",
        })
      }
    }, [highlightedIndex])

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
    const visibleOptions = useMemo(() => {
      const normalizedQuery = searchQuery.trim().toLowerCase()
      const filtered =
        !searchable || !normalizedQuery ?
          options
        : options.filter((option) => {
            const searchText =
              getOptionSearchText?.(option) ??
              (typeof option.label === "string" ? option.label : String(option.value))
            return searchText.toLowerCase().includes(normalizedQuery)
          })
      return maxVisibleOptions ? filtered.slice(0, maxVisibleOptions) : filtered
    }, [getOptionSearchText, maxVisibleOptions, options, searchQuery, searchable])

    useEffect(() => {
      if (!isOpen) {
        setSearchQuery("")
        return
      }
      if (searchable) searchInputRef.current?.focus()
    }, [isOpen, searchable])

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
        if ((e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) && isOpen) {
          e.preventDefault()
          e.stopPropagation()
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
        visibleOptions.length * 36 +
          (showPlaceholderOption && allowClear ? 44 : 0) +
          (searchable ? 48 : 0) +
          12,
      )
      const measuredHeight = menuRef.current?.offsetHeight ?? estimatedHeight
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      let shouldOpenUp: boolean
      if (pinnedOpensUpRef.current !== null) {
        shouldOpenUp = pinnedOpensUpRef.current
      } else {
        shouldOpenUp = spaceBelow < measuredHeight && spaceAbove > spaceBelow
        pinnedOpensUpRef.current = shouldOpenUp
      }

      const viewportPadding = 8
      const gap = 4
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow
      const maxContentHeight = Math.min(
        maxHeight,
        Math.max(80, availableSpace - gap - viewportPadding - (searchable ? 48 : 0)),
      )

      setMenuPosition({
        top: shouldOpenUp ? undefined : buttonRect.bottom + gap,
        bottom: shouldOpenUp ? window.innerHeight - buttonRect.top + gap : undefined,
        left: buttonRect.left,
        width: buttonRect.width,
        buttonRight: buttonRect.right,
        opensUp: shouldOpenUp,
        maxContentHeight,
        parentLeft: parentRect.left,
        parentWidth: parentRect.width,
      })
    }, [
      allowClear,
      maxHeight,
      searchable,
      showPlaceholderOption,
      alignToSelector,
      visibleOptions.length,
    ])

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
        layout={fit ? "size" : undefined}
        transition={{ layout: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
        className={`relative min-w-0 ${fit ? "w-fit" : ""} ${className}`}
        ref={internalRef}
        {...cleanProps}>
        <Tooltip
          content={displayText}
          offset={4}
          disabled={trigger != null || !shouldShowCustomTooltip(displayText)}
          className="!px-2.5 !py-1.5 text-center break-all">
          <motion.button
            layout="size"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            type="button"
            ref={buttonRef as React.RefObject<HTMLButtonElement | null>}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggle}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup={searchable ? "listbox" : "menu"}
            aria-expanded={isOpen && !disabled}
            className={`dropdown-trigger group/dropdown flex min-w-0 cursor-pointer items-center ${
              fit ? "w-fit justify-start gap-2.5" : "justify-between"
            } ${fit ? "w-fit" : "w-full"} rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/10 hover:bg-white/[0.08] focus:border-white/20 focus:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 ${buttonClassName}`}>
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={String(value ?? "placeholder")}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className={`min-w-0 ${fit ? "" : "flex-1"} truncate text-left`}>
                {trigger ?? displayText}
              </motion.span>
            </AnimatePresence>
            {showChevron && (
              <span
                aria-hidden="true"
                className={`${fit ? "" : "ms-3"} flex size-4 shrink-0 items-center justify-center`}>
                <ChevronDown
                  className={`size-3.5 transition-all duration-200 ${
                    isOpen ? "rotate-180 text-white" : (
                      "text-white/65 group-hover/dropdown:text-white"
                    )
                  } ${iconClassName}`}
                />
              </span>
            )}
          </motion.button>
        </Tooltip>

        {createPortal(
          <AnimatePresence>
            {isOpen && !disabled && (
              <>
                <motion.div
                  ref={menuRef}
                  layout="position"
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    y: menuPosition?.opensUp ? 4 : -4,
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    y: menuPosition?.opensUp ? 4 : -4,
                  }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="fixed z-9999 overflow-hidden rounded-lg border border-white/10 bg-[#141518] shadow-2xl backdrop-blur-md"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    top:
                      menuPosition ?
                        menuPosition.top !== undefined ?
                          `${menuPosition.top}px`
                        : undefined
                      : "-9999px",
                    bottom:
                      menuPosition?.bottom !== undefined ? `${menuPosition.bottom}px` : undefined,
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
                  {searchable && (
                    <div className="border-b border-white/5 p-1.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/35" />
                        <input
                          ref={searchInputRef}
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                              event.preventDefault()
                              setHighlightedIndex((prev) => {
                                if (visibleOptions.length === 0) return -1
                                for (let i = prev + 1; i < visibleOptions.length; i++) {
                                  if (!visibleOptions[i].disabled) return i
                                }
                                return prev < 0 && !visibleOptions[0].disabled ? 0 : prev
                              })
                            } else if (event.key === "ArrowUp") {
                              event.preventDefault()
                              setHighlightedIndex((prev) => {
                                if (visibleOptions.length === 0) return -1
                                for (let i = prev - 1; i >= 0; i--) {
                                  if (!visibleOptions[i].disabled) return i
                                }
                                return prev
                              })
                            } else if (event.key === "Enter") {
                              const targetOption =
                                highlightedIndex >= 0 && highlightedIndex < visibleOptions.length ?
                                  visibleOptions[highlightedIndex]
                                : visibleOptions.find((option) => !option.disabled)
                              if (!targetOption || targetOption.disabled) return
                              event.preventDefault()
                              handleSelect(targetOption.value)
                            }
                          }}
                          placeholder={searchPlaceholder}
                          aria-label={searchAriaLabel}
                          className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] pr-2 pl-8 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        />
                      </div>
                    </div>
                  )}
                  <div
                    role={searchable ? "listbox" : undefined}
                    aria-label={searchable ? ariaLabel : undefined}
                    className="custom-scroll overflow-y-auto"
                    style={{ maxHeight: `${menuPosition?.maxContentHeight ?? maxHeight}px` }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {visibleOptions.length === 0 ?
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="px-3 py-2 text-center text-[11px] font-medium text-white/55">
                          {emptyMessage}
                        </motion.div>
                      : <motion.div
                          key="options-list"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}>
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

                          {visibleOptions.map((option, idx) => (
                            <div key={option.value !== "" ? String(option.value) : `empty-${idx}`}>
                              <Tooltip
                                content={
                                  typeof option.label === "string" ? option.label : undefined
                                }
                                offset={4}
                                disabled={!shouldShowCustomTooltip(option.label)}
                                className="!px-2.5 !py-1.5 text-center break-all">
                                <button
                                  ref={(el) => {
                                    optionRefs.current[idx] = el
                                  }}
                                  type="button"
                                  role={searchable ? "option" : undefined}
                                  aria-selected={searchable ? value === option.value : undefined}
                                  onClick={() => handleSelect(option.value)}
                                  onMouseEnter={() => !option.disabled && setHighlightedIndex(idx)}
                                  disabled={option.disabled}
                                  className={`flex w-full items-center gap-2 truncate rounded-none px-3 py-1.5 text-left text-xs transition-colors ${
                                    value === option.value ?
                                      "bg-cyan-500/10 font-semibold text-cyan-400"
                                    : option.disabled ? "cursor-not-allowed text-white/55"
                                    : highlightedIndex === idx ? "bg-white/[0.08] text-white"
                                    : "text-white/70 hover:bg-white/5 hover:text-white"
                                  } ${optionClassName}`}>
                                  {option.icon && (
                                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-xs opacity-75">
                                      {option.icon}
                                    </span>
                                  )}
                                  <span className="block flex-1 truncate">
                                    {renderOption?.(option, value === option.value) ?? option.label}
                                  </span>
                                </button>
                              </Tooltip>
                              {option.dividerBelow && <div className="mx-2 my-1 h-px bg-white/5" />}
                            </div>
                          ))}
                        </motion.div>
                      }
                    </AnimatePresence>
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
