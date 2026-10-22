import React, { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ModalCloseButton } from "@/components/common/ModalCloseButton"

interface ModalProps {
  isOpen: boolean
  onClose?: () => void
  title?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | string
  hideCloseButton?: boolean
  headerActions?: React.ReactNode
  animateLayout?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = "sm",
  hideCloseButton = false,
  headerActions,
  animateLayout = false,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const windowBarHeightPx = 32

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose()
        return
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return

        const focusableSelector =
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll(focusableSelector),
        ) as HTMLElement[]

        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus()
            e.preventDefault()
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus()
            e.preventDefault()
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const maxWidthClass =
    {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
    }[maxWidth] || maxWidth

  const snappyTransition = {
    duration: 0.25,
    ease: [0.16, 1, 0.3, 1] as const,
  }

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          style={{ top: `${windowBarHeightPx}px` }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            ref={modalRef}
            layout={animateLayout}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={snappyTransition}
            style={{ willChange: "transform, opacity" }}
            className={`relative z-10 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0f1011] shadow-2xl backdrop-blur-xl ${maxWidthClass}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              {(title || !hideCloseButton || headerActions) && (
                <div
                  className={`flex items-start ${title ? "mb-5 justify-between gap-4" : "mb-2 justify-end"}`}>
                  {title && (
                    <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                      {icon}
                      <div
                        className={
                          typeof title === "string" ?
                            "min-w-0 flex-1 truncate py-0.5 text-base leading-normal font-semibold tracking-tight text-white"
                          : "min-w-0 flex-1 text-white"
                        }>
                        {title}
                      </div>
                    </div>
                  )}
                  <div className="flex shrink-0 items-center gap-4">
                    {headerActions}
                    {!hideCloseButton && onClose && <ModalCloseButton onClick={onClose} />}
                  </div>
                </div>
              )}
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
