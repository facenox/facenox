import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  DialogContext,
  type AlertDialogOptions,
  type ConfirmDialogOptions,
  type DialogAPI,
  type DialogVariant,
} from "@/components/shared/DialogContext"
import { Modal } from "@/components/common"

type ActiveDialogState =
  | {
      type: "alert"
      options: Required<Pick<AlertDialogOptions, "message">> & Omit<AlertDialogOptions, "message">
      resolve: () => void
    }
  | {
      type: "confirm"
      options: Required<Pick<ConfirmDialogOptions, "message">> &
        Omit<ConfirmDialogOptions, "message">
      resolve: (result: boolean) => void
    }

function getButtonClasses(variant: DialogVariant): string {
  if (variant === "danger") {
    return "rounded-lg bg-red-500 text-slate-950 hover:bg-red-400 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)]"
  }

  return "rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)]"
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialogState | null>(null)
  const [typedConfirmation, setTypedConfirmation] = useState("")
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => {
      primaryButtonRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(id)
  }, [active])

  const alert = useCallback(async (options: AlertDialogOptions) => {
    return await new Promise<void>((resolve) => {
      setTypedConfirmation("")
      setActive({
        type: "alert",
        options: {
          title: options.title,
          message: options.message,
          buttonText: options.buttonText || "OK",
          variant: options.variant || "default",
        },
        resolve,
      })
    })
  }, [])

  const confirm = useCallback(async (options: ConfirmDialogOptions) => {
    return await new Promise<boolean>((resolve) => {
      setTypedConfirmation("")
      setActive({
        type: "confirm",
        options: {
          title: options.title,
          message: options.message,
          confirmText: options.confirmText || "Confirm",
          cancelText: options.cancelText || "Cancel",
          confirmVariant: options.confirmVariant || "default",
          requireTypedConfirmation: options.requireTypedConfirmation,
        },
        resolve,
      })
    })
  }, [])

  const api = useMemo<DialogAPI>(() => ({ alert, confirm }), [alert, confirm])

  const close = useCallback(() => {
    setTypedConfirmation("")
    setActive(null)
  }, [])

  const handleOverlayClick = useCallback(() => {
    if (!active) return
    if (active.type === "alert") {
      active.resolve()
      close()
      return
    }

    active.resolve(false)
    close()
  }, [active, close])

  const requiredConfirmationValue =
    active?.type === "confirm" ? active.options.requireTypedConfirmation?.value : undefined
  const isTypedConfirmationSatisfied =
    !requiredConfirmationValue || typedConfirmation.trim() === requiredConfirmationValue

  return (
    <DialogContext.Provider value={api}>
      {children}

      <Modal
        isOpen={!!active}
        onClose={handleOverlayClick}
        title={active?.options.title}
        icon={
          active?.type === "confirm" ?
            <i className="fa-solid fa-triangle-exclamation text-orange-300" />
          : <i className="fa-solid fa-circle-info text-cyan-300" />
        }
        maxWidth="sm">
        <div className="space-y-6">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/80">
            {active?.options.message}
          </p>

          {active?.type === "confirm" && active.options.requireTypedConfirmation && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/55">
                {active.options.requireTypedConfirmation.label ||
                  `To confirm, type ${active.options.requireTypedConfirmation.value}`}
              </label>
              <input
                type="text"
                autoFocus
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-300 outline-none focus:border-white/30 focus:bg-white/[0.08] focus:outline-none"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {active?.type === "confirm" && (
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]"
                onClick={() => {
                  active.resolve(false)
                  close()
                }}>
                {active.options.cancelText || "Cancel"}
              </button>
            )}
            <button
              ref={primaryButtonRef}
              disabled={active?.type === "confirm" && !isTypedConfirmationSatisfied}
              type="button"
              className={
                getButtonClasses(
                  active?.type === "alert" ?
                    active.options.variant || "default"
                  : active?.options.confirmVariant || "default",
                ) +
                " min-w-[100px] px-6 py-2 text-[11px] font-bold tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
              }
              onClick={() => {
                if (active?.type === "alert") {
                  active.resolve()
                } else {
                  active?.resolve(true)
                }
                close()
              }}>
              {active?.type === "alert" ?
                active.options.buttonText || "OK"
              : active?.options.confirmText}
            </button>
          </div>
        </div>
      </Modal>
    </DialogContext.Provider>
  )
}
