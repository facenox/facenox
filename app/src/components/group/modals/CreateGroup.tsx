import { useState, useMemo, useEffect } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"

interface CreateGroupProps {
  isOpen: boolean
  /** Existing groups used to detect duplicate names before creation. */
  existingGroups?: AttendanceGroup[]
  onClose: () => void
  onSuccess: (group: AttendanceGroup) => void
}

/**
 * Modal for creating a new attendance group.
 * Warns the user when the typed name already exists (case-insensitive),
 * requiring a second deliberate click to confirm the duplicate creation —
 * identical UX pattern to AddMember duplicate handling.
 */
export function CreateGroup({ isOpen, existingGroups = [], onClose, onSuccess }: CreateGroupProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  // Reset confirmation state whenever the typed name changes
  useEffect(() => {
    setConfirmDuplicate(false)
  }, [name])

  const isDuplicate = useMemo(() => {
    if (!name.trim()) return false
    const normalizedName = name.trim().toLowerCase()
    return existingGroups.some((g) => g.name.toLowerCase() === normalizedName)
  }, [name, existingGroups])

  const handleClose = () => {
    setName("")
    setLoading(false)
    setError(null)
    setConfirmDuplicate(false)
    onClose()
  }

  const handleCreate = async () => {
    if (!name.trim()) return

    // First click when duplicate: surface warning and switch to "Create Anyway" mode
    if (isDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true)
      return
    }

    setLoading(true)
    try {
      const newGroup = await attendanceManager.createGroup(name.trim())
      onSuccess(newGroup)
      handleClose()
    } catch (err) {
      console.error("Error creating group:", err)
      setError(err instanceof Error ? err.message : "Failed to create group")
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
          <h3 className="mb-2 text-xl font-semibold">Create Group</h3>
        </div>
      }
      maxWidth="md">
      <div className="mt-2">
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="pl-1 text-[11px] font-medium text-white/65">Group Name</span>
            <FormInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
              placeholder=""
              focusColor={
                isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-cyan-500/60"
              }
              className={isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}
            />
            {isDuplicate && !confirmDuplicate && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-400/80">
                <i className="fa-solid fa-triangle-exclamation text-[10px]" />A group with this name
                already exists.
              </div>
            )}
          </label>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || loading}
            className={`min-w-[120px] rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30 ${
              confirmDuplicate && isDuplicate ?
                "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-400"
              : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-400"
            }`}>
            {loading ?
              "Creating…"
            : confirmDuplicate && isDuplicate ?
              "Create Anyway"
            : "Create Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
