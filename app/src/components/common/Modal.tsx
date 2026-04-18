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
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const windowBarHeightPx = 32

  useEffect(() => {
    if (!isOpen || !onClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
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
          className="fixed right-0 bottom-0 left-0 z-100 flex items-center justify-center overflow-hidden px-4"
          style={{ top: `${windowBarHeightPx}px` }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[rgba(5,7,10,0.72)]"
            onClick={onClose}
          />

          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={snappyTransition}
            style={{ willChange: "transform, opacity" }}
            className={`relative z-10 w-full overflow-hidden rounded-xl border border-white/6 bg-[rgba(15,19,25,0.98)] ${maxWidthClass}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              {(title || !hideCloseButton || headerActions) && (
                <div
                  className={`flex items-start ${title ? "mb-5 justify-between" : "mb-2 justify-end"}`}>
                  {title && (
                    <div className="flex items-center gap-2">
                      {icon}
                      <div className="text-base leading-none font-semibold tracking-tight text-white">
                        {title}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
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
