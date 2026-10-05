import { useState } from "react"
import type { AttendanceMember } from "@/types/recognition"
import { Modal } from "@/components/common"

interface DeleteMemberModalProps {
  isOpen: boolean
  member: AttendanceMember | null
  onClose: () => void
  onConfirm: () => void
}

export function DeleteMemberModal({ isOpen, member, onClose, onConfirm }: DeleteMemberModalProps) {
  const [memberSnapshot, setMemberSnapshot] = useState<AttendanceMember | null>(null)

  if (member && member !== memberSnapshot) {
    setMemberSnapshot(member)
  }

  if (!memberSnapshot) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remove Member" maxWidth="md">
      <div className="mb-6">
        <p className="mb-4 break-words text-white">
          Are you sure you want to remove{" "}
          <strong className="break-all">&quot;{memberSnapshot.name}&quot;</strong> from this group?
        </p>
        <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-3">
          <p className="text-sm text-red-300">
            <strong>Warning:</strong> This will also wipe their attendance records and enrolled face
            data for this group.
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-red-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-red-400 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
          Remove Member
        </button>
      </div>
    </Modal>
  )
}
