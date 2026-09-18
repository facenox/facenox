import { useState } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"

interface EditGroupProps {
  isOpen: boolean
  group: AttendanceGroup
  onClose: () => void
  onSuccess: () => void
}

export function EditGroup({ isOpen, group, onClose, onSuccess }: EditGroupProps) {
  const [name, setName] = useState(group.name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setName(group.name)
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
      await attendanceManager.updateGroup(group.id, {
        name: name.trim(),
      })
      onSuccess()
      handleClose()
    } catch (err) {
      console.error("Error updating group:", err)
      setError(err instanceof Error ? err.message : "Failed to update group")
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
          <h3 className="mb-2 text-xl font-semibold">Edit Group</h3>
          <p className="text-xs font-normal text-white/65">Update group information</p>
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
              placeholder=""
              focusColor="border-cyan-500/60"
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
            className="min-w-[120px] rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30">
            {loading ? "Saving…" : "Update Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
