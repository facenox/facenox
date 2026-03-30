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
    return "px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
  }

  return "px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all"
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
              <label className="text-[11px] font-medium text-white/35">
                {active.options.requireTypedConfirmation.label ||
                  `Type "${active.options.requireTypedConfirmation.value}" to continue`}
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                placeholder={active.options.requireTypedConfirmation.placeholder || ""}
                className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2 text-xs text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {active?.type === "confirm" && (
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white"
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
