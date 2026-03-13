import { useEffect, useRef } from "react"
import { FormInput, Modal } from "@/components/common"

interface GroupManagementModalProps {
  showGroupManagement: boolean
  setShowGroupManagement: (show: boolean) => void
  newGroupName: string
  setNewGroupName: (name: string) => void
  handleCreateGroup: () => void
}

export function GroupManagementModal({
  showGroupManagement,
  setShowGroupManagement,
  newGroupName,
  setNewGroupName,
  handleCreateGroup,
}: GroupManagementModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showGroupManagement && inputRef.current) {
      const focusInput = () => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
          inputRef.current.click()
        }
      }

      requestAnimationFrame(() => {
        focusInput()
        setTimeout(focusInput, 50)
        setTimeout(focusInput, 150)
      })
    }
  }, [showGroupManagement])

  // Handle Enter key for submission
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newGroupName.trim()) {
      handleCreateGroup()
    }
  }

  return (
    <Modal
      isOpen={showGroupManagement}
      onClose={() => setShowGroupManagement(false)}
      title="Create Group"
      maxWidth="sm">
      <div className="mt-2 space-y-3">
        <div>
          <FormInput
            ref={inputRef}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter group name"
            focusColor="border-cyan-500/60"
          />
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={() => setShowGroupManagement(false)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            className="min-w-[120px] rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 uppercase transition-all hover:bg-cyan-500/20 disabled:opacity-50">
            Create Group
          </button>
        </div>
      </div>
    </Modal>
  )
}
