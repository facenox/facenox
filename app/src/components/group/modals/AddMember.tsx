import { useState, useRef, useEffect, useMemo } from "react"
import { flushSync } from "react-dom"
import { attendanceManager } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { FormInput, Modal } from "@/components/common"
import { InfoPopover } from "@/components/shared"

interface AddMemberProps {
  isOpen: boolean
  group: AttendanceGroup
  existingMembers?: AttendanceMember[]
  onClose: () => void
  onSuccess: () => void
}

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const consentPopoverContent = {
  title: "Biometric Privacy",
  description:
    "Only add people who have given biometric consent. Face data stays encrypted on this device.",
}

export function AddMember({
  isOpen,
  group,
  existingMembers = [],
  onClose,
  onSuccess,
}: AddMemberProps) {
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
  const singleSubmitInFlightRef = useRef(false)
  const bulkSubmitInFlightRef = useRef(false)

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

  const modalSubtitle = isBulkMode ? "Import people into" : "Add a person to"

  // Reset confirmation when name changes
  useEffect(() => {
    setConfirmDuplicate(false)
  }, [newMemberName])

  const handleAddMember = async () => {
    if (singleSubmitInFlightRef.current) {
      return
    }

    if (!newMemberName.trim()) {
      return
    }

    if (isDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true)
      return
    }

    singleSubmitInFlightRef.current = true
    flushSync(() => {
      setLoading(true)
    })

    try {
      await waitForNextPaint()
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
      singleSubmitInFlightRef.current = false
      setLoading(false)
    }
  }

  const handleBulkAddMembers = async () => {
    if (bulkSubmitInFlightRef.current) {
      return
    }

    if (!bulkMembersText.trim()) {
      return
    }

    bulkSubmitInFlightRef.current = true
    flushSync(() => {
      setIsProcessingBulk(true)
    })
    setBulkResults(null)

    try {
      await waitForNextPaint()
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
      bulkSubmitInFlightRef.current = false
      setIsProcessingBulk(false)
    }
  }

  const renderConsentRow = (label: string) => (
    <div
      className={`rounded-lg transition-all duration-300 ${
        hasBiometricConsent ? "bg-cyan-500/6" : "bg-[rgba(13,17,23,0.82)]"
      }`}>
      <label className="group flex cursor-pointer items-center gap-3 px-3.5 py-3">
        <div className="relative flex h-4.5 w-4.5 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={hasBiometricConsent}
            onChange={(e) => setHasBiometricConsent(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-4.5 w-4.5 rounded-md border border-white/20 bg-[rgba(22,28,36,0.62)] transition-all duration-200 group-hover:border-white/40 peer-checked:border-cyan-500 peer-checked:bg-cyan-500/10" />
          <i className="fa-solid fa-check absolute text-[9px] text-cyan-400 opacity-0 transition-all duration-200 peer-checked:opacity-100" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-tight text-white/85">{label}</span>
            <InfoPopover
              title={consentPopoverContent.title}
              description={consentPopoverContent.description}
            />
          </div>
        </div>
      </label>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={
        <div>
          <h3 className="mb-1 text-xl font-semibold tracking-tight">Add Members</h3>
          <p className="text-[11px] font-normal text-white/50">
            {modalSubtitle} <span className="font-medium text-cyan-400/80">{group.name}</span>
          </p>
        </div>
      }
      maxWidth="lg">
      <div className="-m-5 mt-2 max-h-[90vh] overflow-y-auto p-5">
        {/* Mode selector */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsBulkMode(false)
                setBulkMembersText("")
                setConfirmDuplicate(false)
              }}
              className={`rounded-lg px-4 py-2 text-[11px] font-medium transition ${
                !isBulkMode ?
                  "bg-cyan-500/18 text-cyan-100"
                : "text-white/40 hover:bg-white/10 hover:text-white/80"
              }`}>
              Single
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
                  "bg-cyan-500/18 text-cyan-100"
                : "text-white/40 hover:bg-white/10 hover:text-white/80"
              }`}>
              Bulk Import
            </button>
          </div>
          {isBulkMode && (
            <label className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/30">
              Import File
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
          )}
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
                placeholder="Full Name"
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
                placeholder="Role (Optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMember()
                }}
                focusColor="border-cyan-500/60"
              />
            </label>

            {renderConsentRow("I confirm that this member has given biometric consent.")}
          </div>
        )}

        {/* Bulk Add Form */}
        {isBulkMode && (
          <div className="space-y-4">
            <div>
              <textarea
                value={bulkMembersText}
                onChange={(event) => setBulkMembersText(event.target.value)}
                className="min-h-[132px] w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-3 font-mono text-sm transition-all duration-300 outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
                placeholder="Enter one member per line"
              />
              <div className="mt-2 text-[11px] text-white/30">
                Format: <span className="font-mono text-white/50">Name, Role</span>
              </div>
            </div>

            {renderConsentRow(
              "I confirm that all members in this list have given biometric consent.",
            )}

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
            : "Add Member"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
