import { useState, useEffect, useRef } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceMember } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"

interface EditMemberProps {
  isOpen: boolean
  member: AttendanceMember
  onClose: () => void
  onSuccess: () => void
}

export function EditMember({ isOpen, member, onClose, onSuccess }: EditMemberProps) {
  const [name, setName] = useState(member.name)
  const [role, setRole] = useState(member.role || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const focusInput = () => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }
      requestAnimationFrame(() => {
        focusInput()
        setTimeout(focusInput, 50)
      })
    }
  }, [isOpen])

  const handleClose = () => {
    setName(member.name)
    setRole(member.role || "")
    setError(null)
    setLoading(false)
    onClose()
  }

  const handleSave = async () => {
    if (!name.trim()) {
      return
    }

    setLoading(true)
    try {
      const updates: Partial<AttendanceMember> = {
        name: name.trim(),
        role: role.trim() || undefined,
      }

      await attendanceManager.updateMember(member.person_id, updates)
      onSuccess()
      handleClose()
    } catch (err) {
      console.error("Error updating member:", err)
      setError(err instanceof Error ? err.message : "Failed to update member")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="min-w-0">
          <h3 className="mb-1 truncate text-xl font-bold tracking-tight text-white">Edit Member</h3>
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-white/55">
            <span className="shrink-0">Update details for</span>
            <span
              className="inline-block max-w-[200px] truncate align-bottom text-white/65 sm:max-w-[260px]"
              title={member.name}>
              {member.name}
            </span>
          </p>
        </div>
      }
      maxWidth="md">
      <div className="mt-2">
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="pl-1 text-[11px] font-medium text-white/65">Name</span>
            <FormInput
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder=""
              focusColor="border-white/20"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="pl-1 text-[11px] font-medium text-white/65">
              Role <span className="opacity-50">(Optional)</span>
            </span>
            <FormInput
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder=""
              focusColor="border-white/20"
            />
          </label>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || loading}
            className="min-w-[140px] rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30">
            {loading ?
              <i className="fa-solid fa-circle-notch fa-spin mr-2" />
            : null}
            {loading ? "Saving…" : "Update Member"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
