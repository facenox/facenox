import { useState } from "react"
import type { AttendanceGroup } from "@/components/main/types"
import { Modal } from "@/components/common"

interface DeleteConfirmationModalProps {
  showDeleteConfirmation: boolean
  groupToDelete: AttendanceGroup | null
  currentGroup?: AttendanceGroup | null
  cancelDeleteGroup: () => void
  confirmDeleteGroup: () => void
}

export function DeleteConfirmationModal({
  showDeleteConfirmation,
  groupToDelete,
  cancelDeleteGroup,
  confirmDeleteGroup,
}: DeleteConfirmationModalProps) {
  const [confirmationInput, setConfirmationInput] = useState("")
  const [groupSnapshot, setGroupSnapshot] = useState<AttendanceGroup | null>(null)

  if (groupToDelete && groupToDelete !== groupSnapshot) {
    setGroupSnapshot(groupToDelete)
  }

  const isConfirmationMatch = confirmationInput.trim() === (groupSnapshot?.name ?? "")

  return (
    <Modal
      isOpen={showDeleteConfirmation}
      onClose={() => {
        setConfirmationInput("")
        cancelDeleteGroup()
      }}
      title={groupSnapshot ? `Delete ${groupSnapshot.name}` : "Delete group"}
      icon={<i className="fa-solid fa-triangle-exclamation text-red-400" />}
      maxWidth="sm">
      {!groupSnapshot ? null : (
        <>
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-white/60">
              All member profiles and attendance records will be permanently deleted.
            </p>

            <div className="space-y-1.5 pt-1">
              <label htmlFor="confirm-group-name" className="text-xs font-medium text-white/60">
                To confirm, type{" "}
                <span className="font-mono font-semibold text-white/90">{groupSnapshot.name}</span>
              </label>
              <input
                id="confirm-group-name"
                type="text"
                autoFocus
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                aria-label={`Confirm deletion of ${groupSnapshot.name}`}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-300 outline-none focus:border-white/30 focus:bg-white/[0.08] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmationInput("")
                cancelDeleteGroup()
              }}
              className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmationInput("")
                confirmDeleteGroup()
              }}
              disabled={!isConfirmationMatch}
              className="btn-error rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30">
              Delete group
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
