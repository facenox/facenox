import { useState, useEffect, useRef } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceMember } from "@/types/recognition"
import { FormInput, Modal } from "@/components/common"
import { InfoPopover } from "@/components/shared"

interface EditMemberProps {
  isOpen: boolean
  member: AttendanceMember
  onClose: () => void
  onSuccess: () => void
}

export function EditMember({ isOpen, member, onClose, onSuccess }: EditMemberProps) {
  const [name, setName] = useState(member.name)
  const [role, setRole] = useState(member.role || "")
  const [hasBiometricConsent, setHasBiometricConsent] = useState(member.has_consent || false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
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
  }, [])

  const handleClose = () => {
    setName(member.name)
    setRole(member.role || "")
    setHasBiometricConsent(member.has_consent || false)
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
        has_consent: hasBiometricConsent,
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
        <div>
          <h3 className="mb-1 text-xl font-bold tracking-tight text-white">Edit Member</h3>
          <p className="text-[11px] font-bold tracking-wider text-white/40">
            Update details for <span className="text-white/60">{member.name}</span>
          </p>
        </div>
      }
      maxWidth="md">
      <div className="mt-2">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          <label className="text-sm">
            <FormInput
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New Name"
              focusColor="border-cyan-400/30"
            />
          </label>
          <label className="text-sm">
            <FormInput
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="New Role"
              focusColor="border-cyan-400/30"
            />
          </label>

          {/* Consent Toggle */}
          <div
            className={`rounded-xl transition-all duration-300 ${
              hasBiometricConsent ? "bg-[rgba(18,24,31,0.94)]" : "bg-[rgba(13,17,23,0.82)]"
            }`}>
            <label className="group flex cursor-pointer items-center gap-4 p-4">
              <div className="relative mt-0.5 flex shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={hasBiometricConsent}
                  onChange={(e) => setHasBiometricConsent(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-5 rounded-md border border-white/10 bg-[rgba(22,28,36,0.62)] transition-all duration-200 group-hover:border-white/20" />
                <i className="fa-solid fa-check absolute text-[10px] text-cyan-400/80 opacity-0 transition-all duration-200 peer-checked:opacity-100" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-tight text-white/90">
                    I confirm that this member has provided informed biometric consent.
                  </span>
                  <InfoPopover
                    title="Biometric Privacy"
                    description="Facial features are encrypted and stored strictly on this device. Facenox does not upload biometric data to any external server."
                  />
                </div>
              </div>
            </label>
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || loading}
            className="min-w-[140px] rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-40">
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
