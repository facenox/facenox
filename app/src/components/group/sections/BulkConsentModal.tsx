import { useState, useMemo, useEffect } from "react"
import { Modal } from "@/components/common"
import { createDisplayNameMap } from "@/utils/displayNameUtils"
import type { AttendanceMember } from "@/types/recognition"

interface BulkConsentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (memberIds: string[]) => void
  members: AttendanceMember[]
}

const RENDER_LIMIT = 50

export function BulkConsentModal({ isOpen, onClose, onConfirm, members }: BulkConsentModalProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const displayNameMap = useMemo(() => createDisplayNameMap(members), [members])
  const pendingMembers = useMemo(() => members.filter((m) => !m.has_consent), [members])

  // Pre-select all pending members on modal open for quick 1-click confirmation
  useEffect(() => {
    if (isOpen) {
      setCheckedIds(new Set(pendingMembers.map((m) => m.person_id)))
    }
  }, [isOpen, pendingMembers])

  const allChecked = pendingMembers.length > 0 && checkedIds.size === pendingMembers.length
  const displayedMembers = useMemo(() => pendingMembers.slice(0, RENDER_LIMIT), [pendingMembers])
  const remainingCount = pendingMembers.length - displayedMembers.length

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

        <p className="text-xs text-white/65">
          Check each member you have obtained explicit, informed consent from:
        </p>

        <div className="custom-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {displayedMembers.map((member, idx) => (
            <label
              key={member.person_id || `member-${idx}`}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200 focus-within:border-cyan-500/30 focus-within:bg-cyan-500/10 ${
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
                <div className="h-4 w-4 rounded border border-white/20 bg-[rgba(22,28,36,0.62)] transition-all peer-checked:border-cyan-500 peer-checked:bg-cyan-500/20 peer-focus-visible:border-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400" />
                <i className="fa-solid fa-check absolute text-[8px] text-cyan-400 opacity-0 transition-opacity peer-checked:opacity-100" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white/90">
                  {displayNameMap.get(member.person_id) || member.name}
                </div>
                {member.role && (
                  <div className="text-[11px] font-medium text-white/55">{member.role}</div>
                )}
              </div>
            </label>
          ))}

          {remainingCount > 0 && (
            <div className="py-2 text-center text-[11px] text-white/45">
              + {remainingCount.toLocaleString()} more pending members (included in selection)
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-white/55">
          <span>
            {checkedIds.size.toLocaleString()} of {pendingMembers.length.toLocaleString()} selected
          </span>
          {pendingMembers.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (allChecked) {
                  setCheckedIds(new Set())
                } else {
                  setCheckedIds(new Set(pendingMembers.map((m) => m.person_id)))
                }
              }}
              className="rounded px-1 text-white/55 underline transition-colors hover:text-white/70 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              {allChecked ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={checkedIds.size === 0}
          className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30">
          Grant Consent ({checkedIds.size.toLocaleString()})
        </button>
      </div>
    </Modal>
  )
}
