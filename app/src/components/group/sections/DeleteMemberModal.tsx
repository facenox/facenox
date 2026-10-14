import { useState } from "react"
import type { AttendanceMember } from "@/types/recognition"
import { Modal } from "@/components/common"

interface DeleteMemberModalProps {
  isOpen: boolean
  member: (AttendanceMember & { displayName?: string }) | null
  onClose: () => void
  onConfirm: () => void
}

export function DeleteMemberModal({ isOpen, member, onClose, onConfirm }: DeleteMemberModalProps) {
  const [memberSnapshot, setMemberSnapshot] = useState<
    (AttendanceMember & { displayName?: string }) | null
  >(null)

  if (member && member !== memberSnapshot) {
    setMemberSnapshot(member)
  }

  if (!memberSnapshot) return null

  const memberDisplayName = memberSnapshot.displayName || memberSnapshot.name

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Remove ${memberDisplayName}`}
      icon={<i className="fa-solid fa-triangle-exclamation text-red-400" />}
      maxWidth="sm">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-white/60">
          This will permanently remove their attendance history and enrolled biometric face profile
          for this group.
        </p>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn-error rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
          Remove Member
        </button>
      </div>
    </Modal>
  )
}
