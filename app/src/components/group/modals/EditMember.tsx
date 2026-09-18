import { useState, useEffect, useRef } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceMember } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"
import { useAttendanceStore } from "@/components/main/stores"

interface EditMemberProps {
  isOpen: boolean
  member: AttendanceMember
  onClose: () => void
  onSuccess: () => void
}

export function EditMember({ isOpen, member, onClose, onSuccess }: EditMemberProps) {
  const currentGroup = useAttendanceStore((state) => state.currentGroup)
  const isConsentCertified = Boolean(currentGroup?.settings?.biometric_consent_certified)

  const [name, setName] = useState(member.name)
  const [role, setRole] = useState(member.role || "")
  const [hasBiometricConsent, setHasBiometricConsent] = useState(
    isConsentCertified ? true : member.has_consent || false,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isConsentCertified) {
      setHasBiometricConsent(true)
    }
  }, [isConsentCertified])

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
    setHasBiometricConsent(isConsentCertified ? true : member.has_consent || false)
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
          <p className="text-[11px] font-bold tracking-wider text-white/55">
            Update details for <span className="text-white/65">{member.name}</span>
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
              focusColor="border-cyan-400/30"
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
              focusColor="border-cyan-400/30"
            />
          </label>

          {/* Explicit Certification Consent Checkbox */}
          {!isConsentCertified && (
            <label className="group mt-3 flex cursor-pointer items-start gap-2.5 py-1.5 select-none">
              <div className="relative mt-0.5 flex shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={hasBiometricConsent}
                  onChange={(e) => setHasBiometricConsent(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-150 group-hover:border-white/20 peer-checked:border-cyan-500 peer-checked:bg-cyan-500 peer-focus-visible:border-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400">
                  <svg
                    className={`h-2.5 w-2.5 text-slate-950 transition-opacity duration-150 ${
                      hasBiometricConsent ? "opacity-100" : "opacity-0"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <span className="text-[11px] leading-relaxed text-white/45 transition-colors duration-150 group-hover:text-white/65 peer-focus-visible:text-white">
                I certify that explicit biometric consent has been obtained for this member in
                accordance with the Data Privacy Act.
              </span>
            </label>
          )}
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
