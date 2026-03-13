import type { AttendanceGroup } from "@/components/main/types"
import { Modal } from "@/components/common"

interface DeleteConfirmationModalProps {
  showDeleteConfirmation: boolean
  groupToDelete: AttendanceGroup | null
  currentGroup: AttendanceGroup | null
  cancelDeleteGroup: () => void
  confirmDeleteGroup: () => void
}

export function DeleteConfirmationModal({
  showDeleteConfirmation,
  groupToDelete,
  currentGroup,
  cancelDeleteGroup,
  confirmDeleteGroup,
}: DeleteConfirmationModalProps) {
  if (!groupToDelete) return null

  return (
    <Modal
      isOpen={showDeleteConfirmation}
      onClose={cancelDeleteGroup}
      title="Delete group"
      icon={<i className="fa-solid fa-triangle-exclamation text-red-300"></i>}
      maxWidth="md">
      <div className="mb-6">
        <p className="mb-4 text-sm text-white/80">
          Are you sure you want to delete the group{" "}
          <strong className="text-white">&quot;{groupToDelete.name}&quot;</strong>?
        </p>
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/20 p-3">
          <p className="text-xs text-red-300">
            <strong>Warning:</strong> This action cannot be undone. All group data, members, and
            attendance records will be permanently removed.
          </p>
        </div>
        {currentGroup?.id === groupToDelete.id && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-3">
            <p className="text-xs text-amber-300">
              <strong>Note:</strong> This is your currently active group. Deleting it will clear
              your current selection.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={cancelDeleteGroup}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          Cancel
        </button>
        <button
          onClick={confirmDeleteGroup}
          className="btn-error rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider">
          Delete Group
        </button>
      </div>
    </Modal>
  )
}
