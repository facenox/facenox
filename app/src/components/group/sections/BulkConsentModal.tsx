import { useState, useMemo } from "react"
import { Modal } from "@/components/common"
import type { AttendanceMember } from "@/types/recognition"

interface BulkConsentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (memberIds: string[]) => void
  members: AttendanceMember[]
}

export function BulkConsentModal({ isOpen, onClose, onConfirm, members }: BulkConsentModalProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const pendingMembers = useMemo(() => members.filter((m) => !m.has_consent), [members])

  const allChecked = pendingMembers.length > 0 && checkedIds.size === pendingMembers.length

  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(checkedIds))
    setCheckedIds(new Set())
  }

  const handleClose = () => {
    setCheckedIds(new Set())
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      icon={<i className="fa-solid fa-shield-check text-cyan-400" />}
      title="Grant Biometric Consent"
      maxWidth="sm">
      <div className="custom-scroll mt-2 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-amber-200/80">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            Under the Data Privacy Act and GDPR, biometric consent must be{" "}
            <strong>specific and individual</strong>.
          </p>
        </div>

        <p className="text-xs text-white/50">
          Check each member you have obtained explicit, informed consent from:
        </p>

        <div className="custom-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {pendingMembers.map((member) => (
            <label
              key={member.person_id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200 ${
                checkedIds.has(member.person_id) ?
                  "border-cyan-500/30 bg-cyan-500/10"
                : "border-white/8 bg-white/3 hover:border-white/15"
              }`}>
              <div className="relative flex shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={checkedIds.has(member.person_id)}
                  onChange={() => toggle(member.person_id)}
                  className="peer sr-only"
                />
                <div className="h-4 w-4 rounded border border-white/20 bg-[rgba(22,28,36,0.62)] transition-all peer-checked:border-cyan-500 peer-checked:bg-cyan-500/20" />
                <i className="fa-solid fa-check absolute text-[8px] text-cyan-400 opacity-0 transition-opacity peer-checked:opacity-100" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white/90">{member.name}</div>
                {member.role && (
                  <div className="text-[11px] font-medium text-white/40">{member.role}</div>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-white/40">
          <span>
            {checkedIds.size} of {pendingMembers.length} confirmed
          </span>
          {!allChecked && pendingMembers.length > 1 && (
            <button
              type="button"
              onClick={() => setCheckedIds(new Set(pendingMembers.map((m) => m.person_id)))}
              className="text-white/40 underline transition-colors hover:text-white/70">
              Select all
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={checkedIds.size === 0}
          className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-4 py-1.5 text-[11px] font-bold tracking-wider text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40">
          Grant Consent ({checkedIds.size})
        </button>
      </div>
    </Modal>
  )
}
