import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"

interface InfoPopoverProps {
  /** Short label shown in the header of the popover */
  title: string
  /** Main explanation text */
  description: string
  /** Optional extra detail bullets */
  details?: string[]
  /**
   * Optional media slot: pass an image src or a <video> element.
   * When omitted the popover is text-only.
   * Future: pass a video src for Anti-Spoof demo, etc.
   */
  media?: {
    type: "image" | "video"
    src: string
    alt?: string
  }
  /** Preferred side to open. Defaults to "right" (good for inline settings). */
  side?: "top" | "bottom" | "left" | "right"
}

const OFFSET = 12
const SCREEN_PAD = 8
const POPOVER_OPEN_DELAY = 200
const POPOVER_ANIMATION_DURATION = 0.15

export function InfoPopover({
  title,
  description,
  details,
  media,
  side = "right",
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const measure = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const pw = popoverRef.current.offsetWidth
    const ph = popoverRef.current.offsetHeight
    const { innerWidth: vw, innerHeight: vh } = window

    let top = tr.top + tr.height / 2 - ph / 2
    let left = tr.right + OFFSET

    if (side === "left") left = tr.left - pw - OFFSET
    if (side === "top") {
      top = tr.top - ph - OFFSET
      left = tr.left + tr.width / 2 - pw / 2
    }
    if (side === "bottom") {
      top = tr.bottom + OFFSET
      left = tr.left + tr.width / 2 - pw / 2
    }

    left = Math.max(SCREEN_PAD, Math.min(left, vw - pw - SCREEN_PAD))
    top = Math.max(SCREEN_PAD, Math.min(top, vh - ph - SCREEN_PAD))

    setPos({ top, left })
  }, [side])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(measure)
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [open, measure])

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setOpen(true), POPOVER_OPEN_DELAY)
  }, [])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }, [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="m-0 inline-flex cursor-default items-center border-none bg-transparent p-0 leading-none text-white/20 shadow-none transition-colors duration-150 outline-none hover:text-cyan-400/70 focus:outline-none"
        aria-label={`More info about ${title}`}>
        <i className="fa-regular fa-circle-question text-[11px] leading-none" aria-hidden="true" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.96, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4 }}
              transition={{ duration: POPOVER_ANIMATION_DURATION, ease: "easeOut" }}
              className="pointer-events-none fixed z-99999 w-64"
              style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? "visible" : "hidden",
              }}>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[rgba(15,19,25,0.98)]">
                {media && (
                  <div className="relative w-full overflow-hidden bg-black/40">
                    {media.type === "image" ?
                      <img
                        src={media.src}
                        alt={media.alt ?? title}
                        className="h-32 w-full object-cover opacity-80"
                      />
                    : <video
                        src={media.src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-32 w-full object-cover opacity-80"
                      />
                    }
                    <div className="absolute inset-0 bg-linear-to-t from-[rgba(15,19,25,0.98)] to-transparent" />
                  </div>
                )}

                <div className="space-y-2 px-3.5 py-3">
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-info text-[10px] text-cyan-400/60" />
                    <span className="text-[11px] font-semibold tracking-wide text-cyan-400/80">
                      {title}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-white/50">{description}</p>

                  {details && details.length > 0 && (
                    <ul className="space-y-1 border-t border-white/8 pt-2">
                      {details.map((detail, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-1.5 text-[10.5px] text-white/35">
                          <span className="mt-0.5 text-cyan-500/40">&gt;</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
