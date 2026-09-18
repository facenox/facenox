import { useState } from "react"

import { ErrorMessage, Modal } from "@/components/common"
import { InfoPopover } from "@/components/shared"
import { attendanceManager } from "@/services/AttendanceManager"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { useGroupStore } from "@/components/group/stores"
import { getActiveWebSocketService } from "@/services/WebSocketService"
import { getLocalDateString } from "@/utils"
import type { AttendanceRecord } from "@/components/main/types"

interface ManualCorrectionModalProps {
  isOpen: boolean
  record: AttendanceRecord
  displayName: string
  onClose: () => void
  onVoided: () => void | Promise<void>
}

export function ManualCorrectionModal({
  isOpen,
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

  const handleClose = () => {
    setReason("")
    setError(null)
    setIsSubmitting(false)
    onClose()
  }

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

      if (store.currentGroup) {
        const cooldownKey = `${record.person_id}-${store.currentGroup.id}`
        store.setPersistentCooldowns((prev) => {
          const next = new Map(prev)
          next.delete(cooldownKey)
          return next
        })

        // Dynamic Backend Cooldown Reset: Trigger config reload over the active socket to wipe the Python cache
        const activeSocket = getActiveWebSocketService()
        if (activeSocket && activeSocket.isWebSocketReady()) {
          activeSocket.updateLiveConfig({ groupId: store.currentGroup.id })
        }
      }

      setSuccess(`${displayName} attendance entry removed`)
      await Promise.resolve(onVoided())

      // Refresh Overview cache so Activity Log shows up-to-date data immediately
      if (record.group_id) {
        const today = getLocalDateString(new Date())
        await useGroupStore.getState().fetchOverviewData(record.group_id, today, today)
      }

      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove attendance entry.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) handleClose()
      }}
      title={
        <div>
          <h3 className="text-base font-semibold text-white">Remove Attendance</h3>
          <p className="mt-0.5 text-xs text-white/40">
            Removing entry for <span className="font-medium text-white/60">{displayName}</span>
          </p>
        </div>
      }
      maxWidth="sm">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold tracking-wide text-white/55 uppercase">
              Reason Required
            </label>
            <InfoPopover
              title="Reason Required"
              description="Add a short note explaining why this attendance entry should be removed."
              side="top"
            />
          </div>
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
            className="custom-scroll min-h-24 w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2.5 text-xs leading-relaxed text-white transition-all outline-none placeholder:text-white/40 focus:border-amber-500/30 focus:bg-[rgba(28,35,44,0.82)] focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:outline-none"
          />
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !trimmedReason}
            className="rounded-lg bg-amber-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30">
            {isSubmitting ? "Removing..." : "Remove Entry"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
