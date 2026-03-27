import { useState, useRef, useEffect, useMemo } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { FormInput, Modal } from "@/components/common"
import { InfoPopover } from "@/components/shared"

interface AddMemberProps {
  group: AttendanceGroup
  existingMembers?: AttendanceMember[]
  onClose: () => void
  onSuccess: () => void
}

export function AddMember({ group, existingMembers = [], onClose, onSuccess }: AddMemberProps) {
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberRole, setNewMemberRole] = useState("")
  const [bulkMembersText, setBulkMembersText] = useState("")
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [bulkResults, setBulkResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [hasBiometricConsent, setHasBiometricConsent] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setNewMemberName("")
    setNewMemberRole("")
    setBulkMembersText("")
    setBulkResults(null)
    setIsBulkMode(false)
    setConfirmDuplicate(false)
    setError(null)
  }

  useEffect(() => {
    if (!isBulkMode && nameInputRef.current) {
      const focusInput = () => {
        if (nameInputRef.current) {
          nameInputRef.current.focus()
          nameInputRef.current.select()
          nameInputRef.current.click()
        }
      }

      requestAnimationFrame(() => {
        focusInput()
        setTimeout(focusInput, 50)
        setTimeout(focusInput, 150)
      })
    }
  }, [isBulkMode])

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text()
      setBulkMembersText(text)
    } catch {
      setError("Failed to read file. Please ensure it's a valid text or CSV file.")
    }
  }

  const isDuplicate = useMemo(() => {
    if (!newMemberName.trim()) return false
    const normalizedName = newMemberName.trim().toLowerCase()
    return existingMembers.some((m) => m.name.toLowerCase() === normalizedName)
  }, [newMemberName, existingMembers])

  // Reset confirmation when name changes
  useEffect(() => {
    setConfirmDuplicate(false)
  }, [newMemberName])

  const handleAddMember = async () => {
    if (!newMemberName.trim()) {
      return
    }

    if (isDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true)
      return
    }

    setLoading(true)
    try {
      await attendanceManager.addMember(group.id, newMemberName.trim(), {
        role: newMemberRole.trim() || undefined,
        hasConsent: hasBiometricConsent,
      })
      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      console.error("Error adding member:", err)
      setError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setLoading(false)
    }
  }

  const handleBulkAddMembers = async () => {
    if (!bulkMembersText.trim()) {
      return
    }

    setIsProcessingBulk(true)
    setBulkResults(null)

    try {
      const lines = bulkMembersText.split("\n").filter((line: string) => line.trim())
      let success = 0
      let failed = 0
      const errors: string[] = []

      for (const line of lines) {
        const parts = line.split(",").map((p: string) => p.trim())
        const name = parts[0]
        const role = parts[1] || ""

        if (!name) {
          failed++
          errors.push(`Empty name in line: "${line}"`)
          continue
        }

        try {
          await attendanceManager.addMember(group.id, name, {
            role: role || undefined,
            hasConsent: hasBiometricConsent,
          })
          success++
        } catch (err) {
          failed++
          errors.push(
            `Failed to add "${name}": ${err instanceof Error ? err.message : "Unknown error"}`,
          )
        }
      }

      setBulkResults({ success, failed, errors })
      onSuccess()

      if (failed === 0) {
        setTimeout(() => {
          resetForm()
          onClose()
        }, 2000)
      }
    } catch (err) {
      console.error("Error bulk adding members:", err)
      setError(err instanceof Error ? err.message : "Failed to bulk add members")
    } finally {
      setIsProcessingBulk(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={
        <div>
          <h3 className="mb-1 text-xl font-semibold tracking-tight">Add Members</h3>
          <p className="text-[11px] font-normal text-white/50">
            Enroll new people into{" "}
            <span className="font-medium text-cyan-400/80">{group.name}</span>
          </p>
        </div>
      }
      maxWidth="lg">
      <div className="-m-5 mt-2 max-h-[90vh] overflow-y-auto p-5">
        {/* Tab selector */}
        <div className="mb-4 flex gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => {
              setIsBulkMode(false)
              setBulkMembersText("")
              setConfirmDuplicate(false)
            }}
            className={`rounded-lg px-4 py-2 text-[11px] font-medium transition ${
              !isBulkMode ?
                "bg-cyan-500/20 text-cyan-200"
              : "text-white/40 hover:bg-white/10 hover:text-white/80"
            }`}>
            One person
          </button>
          <button
            onClick={() => {
              setIsBulkMode(true)
              setNewMemberName("")
              setNewMemberRole("")
              setConfirmDuplicate(false)
            }}
            className={`rounded-lg px-4 py-2 text-[11px] font-medium transition ${
              isBulkMode ?
                "bg-cyan-500/20 text-cyan-200"
              : "text-white/40 hover:bg-white/10 hover:text-white/80"
            }`}>
            Bulk Add
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Single Member Form */}
        {!isBulkMode && (
          <div className="grid gap-4">
            <label className="text-sm">
              <FormInput
                ref={nameInputRef}
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                placeholder="Enter Name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMember()
                }}
                focusColor={
                  isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-cyan-500/60"
                }
                className={`${isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}`}
              />
              {isDuplicate && !confirmDuplicate && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-400/80">
                  <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> A member with
                  this name already exists.
                </div>
              )}
            </label>
            <label className="text-sm">
              <FormInput
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value)}
                placeholder="Enter Role (Optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMember()
                }}
                focusColor="border-cyan-500/60"
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
                  <div className="h-5 w-5 rounded-md border border-white/20 bg-[rgba(22,28,36,0.62)] transition-all duration-200 group-hover:border-white/40 peer-checked:border-cyan-500 peer-checked:bg-cyan-500/10" />
                  <i className="fa-solid fa-check absolute text-[9px] text-cyan-400 opacity-0 transition-all duration-200 peer-checked:opacity-100" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-tight text-white/90">
                      I confirm that this member has provided informed biometric consent.
                    </span>
                    <InfoPopover
                      title="Privacy First"
                      description="Facial features will be encrypted and stored strictly on this device. Facenox does not upload biometric data to any cloud servers."
                    />
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Bulk Add Form */}
        {isBulkMode && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-white/60">Upload CSV/TXT file or paste below</span>
                <label className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1 text-xs text-cyan-200 transition hover:bg-cyan-500/30">
                  Upload File
                  <input
                    type="file"
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleFileUpload(file)
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>
              <textarea
                value={bulkMembersText}
                onChange={(event) => setBulkMembersText(event.target.value)}
                className="min-h-[200px] w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-3 font-mono text-sm transition-all duration-300 outline-none focus:border-cyan-500/35 focus:bg-[rgba(28,35,44,0.82)] focus:ring-2 focus:ring-cyan-500/6"
                placeholder="Enter one member per line. Format:&#10;Name, Role (optional)&#10;&#10;Example:&#10;John Doe, Student&#10;Jane Smith, Teacher&#10;Bob Johnson"
              />
              <div className="mt-2 text-[11px] text-white/30">
                Format: <span className="font-mono text-white/50">Name, Role</span> (one per line,
                role is optional)
              </div>
            </div>

            {/* Consent Toggle (Bulk) */}
            <div
              className={`rounded-xl border transition-all duration-300 ${
                hasBiometricConsent ?
                  "border-cyan-500/30 bg-[rgba(18,24,31,0.94)]"
                : "border-white/10 bg-[rgba(13,17,23,0.82)]"
              }`}>
              <label className="group flex cursor-pointer items-start gap-4 p-4">
                <div className="relative mt-0.5 flex shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={hasBiometricConsent}
                    onChange={(e) => setHasBiometricConsent(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-5 rounded-md border border-white/20 bg-[rgba(22,28,36,0.62)] transition-all duration-200 group-hover:border-white/40 peer-checked:border-cyan-500 peer-checked:bg-cyan-500/10" />
                  <i className="fa-solid fa-check absolute text-[9px] text-cyan-400 opacity-0 transition-all duration-200 peer-checked:opacity-100" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-tight text-white/90">
                      I verify that all members in this list have provided explicit consent.
                    </span>
                    <InfoPopover
                      title="Administrative Responsibility"
                      description="As an administrator, you are responsible for ensuring offline consent records are maintained. All data remains within your local encrypted vault."
                    />
                  </div>
                </div>
              </label>
            </div>

            {/* Bulk Results */}
            {bulkResults && (
              <div
                className={`rounded-lg border p-3 ${
                  bulkResults.failed === 0 ?
                    "border-cyan-500/40 bg-cyan-500/10"
                  : "border-yellow-500/40 bg-yellow-500/10"
                }`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {bulkResults.failed === 0 ? "✓ Success!" : "⚠ Partial Success"}
                  </span>
                  <span className="text-xs">
                    {bulkResults.success} added, {bulkResults.failed} failed
                  </span>
                </div>
                {bulkResults.errors.length > 0 && (
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {bulkResults.errors.map((err: string, idx: number) => (
                      <div
                        key={idx}
                        className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-200">
                        {err}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
            Cancel
          </button>
          <button
            onClick={isBulkMode ? () => void handleBulkAddMembers() : handleAddMember}
            disabled={
              loading ||
              isProcessingBulk ||
              (!isBulkMode && !newMemberName.trim()) ||
              (isBulkMode && !bulkMembersText.trim()) ||
              !hasBiometricConsent
            }
            className={`min-w-[120px] rounded-lg border px-6 py-2 text-[11px] font-bold tracking-wider transition-colors disabled:opacity-50 ${
              confirmDuplicate && !isBulkMode ?
                "border-amber-400/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
              : "border-cyan-400/40 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
            }`}>
            {loading || isProcessingBulk ?
              "Processing..."
            : !hasBiometricConsent ?
              "Consent Required"
            : confirmDuplicate && !isBulkMode ?
              "Add Anyway"
            : isBulkMode ?
              "Add Members"
            : "Create Member"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
