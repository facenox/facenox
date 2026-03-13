import { useState } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"

interface EditGroupProps {
  group: AttendanceGroup
  onClose: () => void
  onSuccess: () => void
}

export function EditGroup({ group, onClose, onSuccess }: EditGroupProps) {
  const [name, setName] = useState(group.name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      onClose()
    } catch (err) {
      console.error("Error updating group:", err)
      setError(err instanceof Error ? err.message : "Failed to update group")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div>
          <h3 className="mb-2 text-xl font-semibold">Edit Group</h3>
          <p className="text-[11px] font-normal text-white/50">Update group information</p>
        </div>
      }
      maxWidth="lg">
      <div className="mt-2">
        {error && <ErrorMessage message={error} />}

        <div className="grid gap-4">
          <FormInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter Group Name"
            focusColor="border-cyan-500/60"
          />
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || loading}
            className="min-w-[120px] rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-100 uppercase transition-colors hover:bg-cyan-500/30 disabled:opacity-50">
            {loading ? "Saving…" : "Update Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
