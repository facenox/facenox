import { useState } from "react"

import { Modal } from "@/components/common"
import { attendanceManager } from "@/services/AttendanceManager"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import type { AttendanceRecord } from "@/components/main/types"

interface ManualCorrectionModalProps {
  record: AttendanceRecord
  displayName: string
  onClose: () => void
  onVoided: () => void | Promise<void>
}

export function ManualCorrectionModal({
  record,
  displayName,
  onClose,
  onVoided,
}: ManualCorrectionModalProps) {
  const { setSuccess } = useUIStore()
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedReason = reason.trim()

  const handleSubmit = async () => {
    if (!trimmedReason || isSubmitting) {
      if (!trimmedReason) {
        setError("Please enter a short reason before removing this attendance entry.")
      }
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await attendanceManager.voidRecord(record.id, trimmedReason, "desktop_admin")
      const store = useAttendanceStore.getState()
      store.setRecentAttendance(store.recentAttendance.filter((item) => item.id !== record.id))
      setSuccess(`${displayName} attendance entry removed`)
      await Promise.resolve(onVoided())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove attendance entry.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        if (!isSubmitting) onClose()
      }}
      title={<span className="text-[15px] font-semibold text-white/92">Remove Attendance</span>}
      maxWidth="sm">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="text-sm leading-relaxed text-amber-100/90">
            This will remove the attendance entry for <strong>{displayName}</strong> and update
            today&apos;s status.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold tracking-wide text-white/45 uppercase">
            Reason Required
          </label>
          <p className="text-[11px] leading-relaxed text-white/38">
            Add a short note explaining why this attendance entry should be removed.
          </p>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (error) {
                setError(null)
              }
            }}
            placeholder="Example: Wrong member selected"
            rows={4}
            disabled={isSubmitting}
            className="custom-scroll min-h-24 w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2.5 text-xs leading-relaxed text-white transition-all outline-none placeholder:text-white/25 focus:border-amber-500/30 focus:bg-[rgba(28,35,44,0.82)]"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/55 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !trimmedReason}
            className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] font-bold tracking-wide text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            {isSubmitting ? "Removing..." : "Remove Entry"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
