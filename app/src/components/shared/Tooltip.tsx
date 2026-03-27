import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type ReactElement,
} from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"

type TooltipPosition = "top" | "bottom" | "left" | "right"

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  position?: TooltipPosition
  delay?: number
  disabled?: boolean
}

interface TooltipCoords {
  top: number
  left: number
  arrowStyle: React.CSSProperties
}

const TOOLTIP_OFFSET = 8
const ARROW_SIZE = 5
const SCREEN_PADDING = 8

function computeCoords(
  triggerRect: DOMRect,
  tw: number,
  th: number,
  preferred: TooltipPosition,
): { top: number; left: number; actualPosition: TooltipPosition } {
  const { innerWidth: vw, innerHeight: vh } = window
  const midX = triggerRect.left + triggerRect.width / 2
  const midY = triggerRect.top + triggerRect.height / 2

  const slots: Record<TooltipPosition, { top: number; left: number }> = {
    top: {
      top: triggerRect.top - th - TOOLTIP_OFFSET - ARROW_SIZE,
      left: midX - tw / 2,
    },
    bottom: {
      top: triggerRect.bottom + TOOLTIP_OFFSET + ARROW_SIZE,
      left: midX - tw / 2,
    },
    left: {
      top: midY - th / 2,
      left: triggerRect.left - tw - TOOLTIP_OFFSET - ARROW_SIZE,
    },
    right: {
      top: midY - th / 2,
      left: triggerRect.right + TOOLTIP_OFFSET + ARROW_SIZE,
    },
  }

  const fits: Record<TooltipPosition, boolean> = {
    top: slots.top.top >= SCREEN_PADDING,
    bottom: slots.bottom.top + th <= vh - SCREEN_PADDING,
    left: slots.left.left >= SCREEN_PADDING,
    right: slots.right.left + tw <= vw - SCREEN_PADDING,
  }

  const order: TooltipPosition[] = [preferred, "top", "bottom", "left", "right"]
  const actual = order.find((p) => fits[p]) ?? preferred

  let { top, left } = slots[actual]
  left = Math.max(SCREEN_PADDING, Math.min(left, vw - tw - SCREEN_PADDING))
  top = Math.max(SCREEN_PADDING, Math.min(top, vh - th - SCREEN_PADDING))

  return { top, left, actualPosition: actual }
}

function buildArrowStyle(
  actual: TooltipPosition,
  triggerRect: DOMRect,
  tooltipLeft: number,
  tooltipTop: number,
): React.CSSProperties {
  const midX = triggerRect.left + triggerRect.width / 2
  const midY = triggerRect.top + triggerRect.height / 2
  const solidDark = `${ARROW_SIZE}px solid rgba(15,19,25,0.98)`
  const transparent = `${ARROW_SIZE}px solid transparent`

  if (actual === "top") {
    return {
      position: "absolute",
      top: "100%",
      left: Math.max(8, midX - tooltipLeft),
      transform: "translateX(-50%)",
      borderLeft: transparent,
      borderRight: transparent,
      borderTop: solidDark,
      borderBottom: "none",
      width: 0,
      height: 0,
    }
  }
  if (actual === "bottom") {
    return {
      position: "absolute",
      bottom: "100%",
      left: Math.max(8, midX - tooltipLeft),
      transform: "translateX(-50%)",
      borderLeft: transparent,
      borderRight: transparent,
      borderBottom: solidDark,
      borderTop: "none",
      width: 0,
      height: 0,
    }
  }
  if (actual === "left") {
    return {
      position: "absolute",
      left: "100%",
      top: Math.max(8, midY - tooltipTop),
      transform: "translateY(-50%)",
      borderTop: transparent,
      borderBottom: transparent,
      borderLeft: solidDark,
      borderRight: "none",
      width: 0,
      height: 0,
    }
  }
  // right
  return {
    position: "absolute",
    right: "100%",
    top: Math.max(8, midY - tooltipTop),
    transform: "translateY(-50%)",
    borderTop: transparent,
    borderBottom: transparent,
    borderRight: solidDark,
    borderLeft: "none",
    width: 0,
    height: 0,
  }
}

function assignRef(ref: unknown, value: HTMLElement | null) {
  if (typeof ref === "function") {
    ref(value)
  } else if (ref && typeof ref === "object" && "current" in ref) {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = value
  }
}

interface TooltipChildWrapperProps {
  child: React.ReactElement
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: (e: React.MouseEvent) => void
  onFocus: (e: React.FocusEvent) => void
  onBlur: (e: React.FocusEvent) => void
  onClick: (e: React.MouseEvent) => void
}

export function TooltipChildWrapper({
  child,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
  ref,
  ...props
}: TooltipChildWrapperProps & { ref?: React.Ref<HTMLElement> }) {
  const childProps = child.props as React.HTMLAttributes<HTMLElement>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.cloneElement(child as any, {
    ...childProps,
    ...props,
    ref,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onClick,
  })
}
TooltipChildWrapper.displayName = "TooltipChildWrapper"

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 500,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<TooltipCoords | null>(null)

  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setVisible(false)
  }, [clearTimer])

  const show = useCallback(() => {
    if (disabled || !content) return
    clearTimer()
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }, [disabled, content, clearTimer, delay])

  useEffect(() => () => clearTimer(), [clearTimer])

  useEffect(() => {
    if (!visible || !triggerRef.current) return

    let rafId: number

    const measure = () => {
      if (!triggerRef.current || !tooltipRef.current) {
        // Retry next frame if DOM isn't ready
        rafId = requestAnimationFrame(measure)
        return
      }

      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tw = tooltipRef.current.offsetWidth
      const th = tooltipRef.current.offsetHeight

      const { top, left, actualPosition } = computeCoords(triggerRect, tw, th, position)
      const arrowStyle = buildArrowStyle(actualPosition, triggerRect, left, top)
      setCoords({ top, left, arrowStyle })
    }

    // Initial measurement
    rafId = requestAnimationFrame(measure)

    // Also re-measure on window scroll/resize to keep it attached if the user moves things
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [visible, position, content])

  const child = React.Children.only(children)
  const isChildValid = React.isValidElement(child)

  // Safely grab the child's ref if it exists
  const childRef =
    isChildValid ?
      (
        child as React.ReactElement<
          React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<unknown> }
        >
      ).props.ref || (child as unknown as { ref?: React.Ref<unknown> }).ref
    : null

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node
      assignRef(childRef, node)
    },
    [childRef],
  )

  // Early returns must happen AFTER hooks
  if (!content || disabled) return children

  const childElement = child as React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<unknown> }
  >
  const childProps = childElement.props

  const handleMouseEnter = (e: React.MouseEvent) => {
    show()
    if (childProps.onMouseEnter) childProps.onMouseEnter(e as never)
  }
  const handleMouseLeave = (e: React.MouseEvent) => {
    hide()
    if (childProps.onMouseLeave) childProps.onMouseLeave(e as never)
  }
  const handleFocus = (e: React.FocusEvent) => {
    show()
    if (childProps.onFocus) childProps.onFocus(e as never)
  }
  const handleBlur = (e: React.FocusEvent) => {
    hide()
    if (childProps.onBlur) childProps.onBlur(e as never)
  }
  const handleClick = (e: React.MouseEvent) => {
    hide()
    if (childProps.onClick) childProps.onClick(e as never)
  }

  return (
    <>
      <TooltipChildWrapper
        child={child}
        ref={mergedRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
      />
      {createPortal(
        <AnimatePresence>
          {visible && (
            <motion.div
              ref={tooltipRef}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="pointer-events-none fixed z-99999"
              style={{
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                visibility: coords ? "visible" : "hidden",
              }}>
              <div className="relative max-w-[280px] rounded-lg border border-white/10 bg-[rgba(15,19,25,0.98)] px-2.5 py-1.5 text-[11px] leading-relaxed font-medium whitespace-normal text-white/90 shadow-[0_10px_28px_rgba(0,0,0,0.38)]">
                {content}
                {coords && <div style={coords.arrowStyle} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
