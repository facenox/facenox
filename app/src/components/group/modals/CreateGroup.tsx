import { useState } from "react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"

interface CreateGroupProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (group: AttendanceGroup) => void
}

export function CreateGroup({ isOpen, onClose, onSuccess }: CreateGroupProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setName("")
    setLoading(false)
    setError(null)
    onClose()
  }

  const handleCreate = async () => {
    if (!name.trim()) {
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
            onClick={handleClose}
            className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="min-w-[120px] rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:opacity-50">
            {loading ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
