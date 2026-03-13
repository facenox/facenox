import type { AttendanceMember } from "@/types/recognition"
import { Modal } from "@/components/common"

interface DeleteMemberModalProps {
  isOpen: boolean
  member: AttendanceMember | null
  onClose: () => void
  onConfirm: () => void
}

export function DeleteMemberModal({ isOpen, member, onClose, onConfirm }: DeleteMemberModalProps) {
  if (!member) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Remove Member"
      icon={<i className="fa-solid fa-user-xmark text-red-200"></i>}
      maxWidth="md">
      <div className="mb-6">
        <p className="mb-4 text-white">
          Are you sure you want to remove <strong>&quot;{member.name}&quot;</strong> from this
          group?
        </p>
        <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-3">
          <p className="text-sm text-red-300">
            <strong>Warning:</strong> This will also wipe their attendance records and registered
            face data for this group.
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg border border-red-500/40 bg-red-500/20 px-6 py-2 text-[11px] font-bold tracking-wider uppercase text-red-200 transition-colors hover:bg-red-500/30">
          Remove Member
        </button>
      </div>
    </Modal>
  )
}
