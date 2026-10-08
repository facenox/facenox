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
        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="pl-1 text-[11px] font-medium text-white/65">Group Name</span>
            <FormInput
              ref={inputRef}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              focusColor="border-white/20"
            />
          </label>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={() => setShowGroupManagement(false)}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            className="min-w-[120px] rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-30">
            Create Group
          </button>
        </div>
      </div>
    </Modal>
  )
}
