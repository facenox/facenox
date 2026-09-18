import { useState, useRef, useEffect, useMemo } from "react"
import { flushSync } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { attendanceManager } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"
import { useGroupUIStore, useGroupStore } from "@/components/group/stores"
import { useAttendanceStore } from "@/components/main/stores"

/**
 * Properties for the AddMember component.
 */
interface AddMemberProps {
  /** Indicates whether the add member modal is open */
  isOpen: boolean
  /** The attendance group to add the member to */
  group: AttendanceGroup
  /** Array of existing group members to prevent duplicate enrollments */
  existingMembers?: AttendanceMember[]
  /** Callback function when the modal is closed */
  onClose: () => void
  /** Callback function when a member is successfully added */
  onSuccess: () => void
}

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const formatValidationError = (
  e: { type?: string; msg?: string; ctx?: { max_length?: number } },
  multiple?: boolean,
): string => {
  if (e.type === "string_too_long") {
    const prefix = multiple ? "Some names exceed" : "Name exceeds"
    return `${prefix} ${e.ctx?.max_length ?? 100} characters`
  }
  return e.msg ?? "Invalid value"
}

/**
 * A modal dialog that allows enrollment of a single new member
 * or multiple new members in bulk via a comma-separated list or file import.
 * Includes biometric consent verification and duplicate warnings.
 */
export function AddMember({
  isOpen,
  group,
  existingMembers = [],
  onClose,
  onSuccess,
}: AddMemberProps) {
  const initialMode = useGroupUIStore((state) => state.addMemberInitialMode)
  const [isBulkMode, setIsBulkMode] = useState(initialMode === "bulk")

  useEffect(() => {
    if (isOpen) {
      setIsBulkMode(initialMode === "bulk")
    }
  }, [isOpen, initialMode])
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberRole, setNewMemberRole] = useState("")
  const [bulkMembersText, setBulkMembersText] = useState("")
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [bulkResults, setBulkResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [hasConsent, setHasConsent] = useState(false)

  const isConsentCertified = Boolean(group?.settings?.biometric_consent_certified)

  useEffect(() => {
    if (isConsentCertified) {
      setHasConsent(true)
    } else if (isOpen) {
      setHasConsent(false)
    }
  }, [isConsentCertified, isOpen])

  const nameInputRef = useRef<HTMLInputElement>(null)
  const singleSubmitInFlightRef = useRef(false)
  const bulkSubmitInFlightRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const resetForm = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setNewMemberName("")
    setNewMemberRole("")
    setBulkMembersText("")
    setBulkResults(null)
    setBulkProgress(null)
    setIsBulkMode(false)
    setConfirmDuplicate(false)
    setError(null)
    setHasConsent(isConsentCertified)
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
      setBulkResults(null)
    } catch {
      setError("Failed to read file. Please ensure it's a valid text or CSV file.")
    }
  }

  const isDuplicate = useMemo(() => {
    if (!newMemberName.trim()) return false
    const normalizedName = newMemberName.trim().toLowerCase()
    return existingMembers.some((m) => m.name.toLowerCase() === normalizedName)
  }, [newMemberName, existingMembers])

  const typedCount = useMemo(() => {
    return bulkMembersText.split("\n").filter((line) => line.trim()).length
  }, [bulkMembersText])

  const modalSubtitle = isBulkMode ? "Add multiple members to" : "Add member to"

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
      const newMember = await attendanceManager.addMember(group.id, newMemberName.trim(), {
        role: newMemberRole.trim() || undefined,
        hasConsent: true,
      })

      useGroupStore.setState({
        members: [...useGroupStore.getState().members, newMember],
      })
      useAttendanceStore.setState({
        groupMembers: [...useAttendanceStore.getState().groupMembers, newMember],
      })

      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      console.error("Error adding member:", err)
      const rawMessage = err instanceof Error ? err.message : ""
      try {
        const parsed = JSON.parse(rawMessage)
        if (Array.isArray(parsed)) {
          const msgs = [...new Set(parsed.map((e) => formatValidationError(e)))]
          setError(msgs.join(". "))
        } else {
          setError(rawMessage || "Failed to add member")
        }
      } catch {
        setError(rawMessage || "Failed to add member")
      }
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
      const total = lines.length
      setBulkProgress({ current: 0, total })

      const membersToCreate: Array<{
        name: string
        role?: string
        email?: string
        hasConsent?: boolean
      }> = []
      const errors: string[] = []
      let failedPrecheck = 0

      for (const line of lines) {
        const parts = line.split(",").map((p: string) => p.trim())
        const name = parts[0]
        const role = parts[1] || ""

        if (!name) {
          failedPrecheck++
          errors.push(`Empty name in line: "${line}"`)
          continue
        }

        membersToCreate.push({
          name,
          role: role || undefined,
          hasConsent: true,
        })
      }

      let success = 0
      let failed = failedPrecheck

      if (membersToCreate.length > 0) {
        const chunkSize = 500
        const totalItems = membersToCreate.length
        setBulkProgress({ current: 0, total: totalItems })

        for (let i = 0; i < totalItems; i += chunkSize) {
          const chunk = membersToCreate.slice(i, i + chunkSize)

          setBulkProgress({ current: i, total: totalItems })
          const res = await attendanceManager.addMembersBulk(chunk, group.id)

          success += res.success_count
          failed += res.error_count
          if (res.errors && res.errors.length > 0) {
            res.errors.forEach((err) => {
              errors.push(`Failed: ${err.error}`)
            })
          }
          if (res.members && res.members.length > 0) {
            useGroupStore.setState({
              members: [...useGroupStore.getState().members, ...res.members],
            })
            useAttendanceStore.setState({
              groupMembers: [...useAttendanceStore.getState().groupMembers, ...res.members],
            })
          }
        }

        setBulkProgress({ current: totalItems, total: totalItems })
      }

      onSuccess()

      if (failed === 0) {
        resetForm()
        onClose()
      } else {
        setBulkResults({ success, failed, errors })
      }
    } catch (err) {
      console.warn("Validation error on bulk add:", err)
      const rawMessage = err instanceof Error ? err.message : ""
      try {
        const parsed = JSON.parse(rawMessage)
        if (Array.isArray(parsed)) {
          const msgs = [...new Set(parsed.map((e) => formatValidationError(e, parsed.length > 1)))]
          setError(msgs.join(". "))
        } else {
          setError(rawMessage || "Failed to bulk add members")
        }
      } catch {
        setError(rawMessage || "Failed to bulk add members")
      }
    } finally {
      bulkSubmitInFlightRef.current = false
      setIsProcessingBulk(false)
    }
  }

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
          <p className="text-xs font-normal text-white/65">
            {modalSubtitle} <span className="font-medium text-cyan-400/80">{group.name}</span>
          </p>
        </div>
      }
      maxWidth="lg">
      <div className="custom-scroll -m-5 mt-2 max-h-[90vh] overflow-x-hidden overflow-y-auto p-5">
        {/* Mode selector Tabs */}
        <div className="mb-6 flex items-end justify-between border-b border-white/5">
          <div className="flex gap-6">
            <button
              onClick={() => {
                setIsBulkMode(false)
                setBulkMembersText("")
                setConfirmDuplicate(false)
              }}
              className={`relative rounded border-none bg-transparent pb-3 text-[12px] font-medium transition-colors outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
                !isBulkMode ? "text-cyan-400" : "text-white/55 hover:text-white/80"
              }`}>
              Single
              {!isBulkMode && (
                <motion.div
                  layoutId="addMemberTabIndicator"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-0 h-[2px] w-full rounded-t-full bg-cyan-400"
                />
              )}
            </button>
            <button
              onClick={() => {
                setIsBulkMode(true)
                setNewMemberName("")
                setNewMemberRole("")
                setConfirmDuplicate(false)
              }}
              className={`relative rounded border-none bg-transparent pb-3 text-[12px] font-medium transition-colors outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
                isBulkMode ? "text-cyan-400" : "text-white/55 hover:text-white/80"
              }`}>
              Multiple
              {isBulkMode && (
                <motion.div
                  layoutId="addMemberTabIndicator"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-0 h-[2px] w-full rounded-t-full bg-cyan-400"
                />
              )}
            </button>
          </div>

          <AnimatePresence>
            {isBulkMode && typedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="pb-3 text-[11px] font-medium text-cyan-400/80">
                {typedCount} {typedCount === 1 ? "member" : "members"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="relative min-h-[180px]">
          <AnimatePresence mode="wait" initial={false}>
            {!isBulkMode ?
              <motion.div
                key="single"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="grid gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="pl-1 text-[11px] font-medium text-white/65">Name</span>
                  <FormInput
                    ref={nameInputRef}
                    value={newMemberName}
                    onChange={(event) => setNewMemberName(event.target.value)}
                    placeholder=""
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMember()
                    }}
                    focusColor={
                      isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-cyan-500/60"
                    }
                    className={`${isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}`}
                  />
                  {isDuplicate && !confirmDuplicate && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-400/80">
                      <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> A member with
                      this name already exists.
                    </div>
                  )}
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="pl-1 text-[11px] font-medium text-white/65">
                    Role <span className="opacity-50">(Optional)</span>
                  </span>
                  <FormInput
                    value={newMemberRole}
                    onChange={(event) => setNewMemberRole(event.target.value)}
                    placeholder=""
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMember()
                    }}
                    focusColor="border-cyan-500/60"
                  />
                </label>

                {/* Explicit Certification Consent Checkbox */}
                {!isConsentCertified && (
                  <label className="group mt-3 flex cursor-pointer items-start gap-2.5 py-1.5 select-none">
                    <div className="relative mt-0.5 flex shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={hasConsent}
                        onChange={(e) => setHasConsent(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-150 group-hover:border-white/20 peer-checked:border-cyan-500 peer-checked:bg-cyan-500 peer-focus-visible:border-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400">
                        <svg
                          className={`h-2.5 w-2.5 text-slate-950 transition-opacity duration-150 ${
                            hasConsent ? "opacity-100" : "opacity-0"
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
              </motion.div>
            : <motion.div
                key="bulk"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-4">
                <div>
                  <textarea
                    value={bulkMembersText}
                    onChange={(event) => {
                      setBulkMembersText(event.target.value)
                      if (bulkResults) {
                        setBulkResults(null)
                      }
                    }}
                    className="custom-scroll min-h-[132px] w-full resize-none rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-3 font-mono text-sm transition-all duration-300 outline-none focus:border-white/20 focus:bg-[rgba(28,35,44,0.82)]"
                    placeholder="Enter one member per line"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-white/55">
                      Format: <span className="font-mono text-white/65">Name, Role</span>
                    </div>
                    <label className="group flex cursor-pointer items-center gap-1.5 text-xs font-medium text-cyan-400/80 transition-colors hover:text-cyan-400">
                      <i className="fa-solid fa-file-arrow-up transition-transform group-hover:-translate-y-0.5"></i>
                      Import .CSV or .TXT
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
                </div>

                {/* Explicit Certification Consent Checkbox for Bulk */}
                {!isConsentCertified && (
                  <label className="group mt-3 flex cursor-pointer items-start gap-2.5 py-1.5 select-none">
                    <div className="relative mt-0.5 flex shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={hasConsent}
                        onChange={(e) => setHasConsent(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-white/5 transition-all duration-150 group-hover:border-white/20 peer-checked:border-cyan-500 peer-checked:bg-cyan-500 peer-focus-visible:border-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400">
                        <svg
                          className={`h-2.5 w-2.5 text-slate-950 transition-opacity duration-150 ${
                            hasConsent ? "opacity-100" : "opacity-0"
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
                      I certify that explicit biometric consent has been obtained for all imported
                      individuals in accordance with the Data Privacy Act.
                    </span>
                  </label>
                )}

                {/* Bulk Results */}
                {bulkResults && (
                  <div className="py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {bulkResults.failed === 0 ?
                          <>
                            <i className="fa-solid fa-circle-check text-[13px] text-cyan-400" />
                            <span className="text-[13px] font-semibold text-cyan-400">
                              Import complete
                            </span>
                          </>
                        : <>
                            <i className="fa-solid fa-triangle-exclamation text-[13px] text-amber-400" />
                            <span className="text-[13px] font-semibold text-amber-400">
                              Import complete with warnings
                            </span>
                          </>
                        }
                      </div>
                      <span className="text-[11px] font-medium text-white/55">
                        {bulkResults.success} added • {bulkResults.failed} failed
                      </span>
                    </div>
                    {bulkResults.errors.length > 0 && (
                      <div className="custom-scroll mt-3 max-h-32 space-y-1.5 overflow-y-auto pl-5">
                        {bulkResults.errors.map((err: string, idx: number) => (
                          <div key={idx} className="text-[11px] leading-relaxed text-red-400/90">
                            • {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            }
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        {!(isBulkMode && bulkResults && bulkResults.failed === 0) && (
          <div className="mt-8 flex justify-end gap-3">
            {isBulkMode && bulkResults ?
              <button
                onClick={() => {
                  resetForm()
                  onClose()
                }}
                className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                Close
              </button>
            : <>
                <button
                  onClick={() => {
                    resetForm()
                    onClose()
                  }}
                  className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                  Cancel
                </button>
                <button
                  onClick={isBulkMode ? () => void handleBulkAddMembers() : handleAddMember}
                  disabled={
                    loading ||
                    isProcessingBulk ||
                    !hasConsent ||
                    (!isBulkMode && !newMemberName.trim()) ||
                    (isBulkMode && !bulkMembersText.trim())
                  }
                  className={`min-w-[120px] rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30 ${
                    confirmDuplicate && !isBulkMode ?
                      "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-400"
                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-400"
                  }`}>
                  {loading || isProcessingBulk ?
                    bulkProgress ?
                      `Processing (${bulkProgress.current}/${bulkProgress.total})`
                    : "Processing..."
                  : confirmDuplicate && !isBulkMode ?
                    "Add Anyway"
                  : isBulkMode ?
                    "Add Members"
                  : "Add Member"}
                </button>
              </>
            }
          </div>
        )}
      </div>
    </Modal>
  )
}
