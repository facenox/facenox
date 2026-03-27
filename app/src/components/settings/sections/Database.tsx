import { useState } from "react"
import type { SettingsOverview } from "@/components/settings/types"
import type { AttendanceGroup } from "@/types/recognition"
import { useDatabaseManagement } from "@/components/settings/sections/hooks/useDatabaseManagement"
import { DatabaseStats } from "@/components/settings/sections/components/DatabaseStats"
import { GroupEntry } from "@/components/settings/sections/components/GroupEntry"
import { useDialog } from "@/components/shared"
import { Modal } from "@/components/common/Modal"
import { useUIStore } from "@/components/main/stores"
import { attendanceManager } from "@/services"

type BackupStatus = { type: "idle" } | { type: "loading"; action: "export" | "import" }

interface DatabaseProps {
  systemData: SettingsOverview
  groups: AttendanceGroup[]
  isLoading: boolean
  onClearDatabase: () => void
  onGroupsChanged?: () => void
}

export function Database({
  systemData,
  groups,
  isLoading,
  onClearDatabase,
  onGroupsChanged,
}: DatabaseProps) {
  const dialog = useDialog()
  const {
    expandedGroups,
    searchQuery,
    setSearchQuery,
    editingMember,
    editingGroup,
    editValue,
    setEditValue,
    savingMember,
    savingGroup,
    deletingGroup,
    deletingMember,
    filteredData,
    toggleGroup,
    startEditing,
    startEditingGroup,
    cancelEditing,
    saveEdit,
    saveGroupEdit,
    handleDeleteGroup,
    handleDeleteMember,
    handleClearAllGroups,
    totalMembers,
  } = useDatabaseManagement(groups, onGroupsChanged, dialog)

  const { setError, setSuccess } = useUIStore()

  const [status, setStatus] = useState<BackupStatus>({ type: "idle" })
  const [isExportingAuditLog, setIsExportingAuditLog] = useState(false)
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean
    action: "export" | "import"
    overwrite?: boolean
  }>({ isOpen: false, action: "export" })
  const [importFilePath, setImportFilePath] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState("")

  const handleExport = async (password: string) => {
    setStatus({ type: "loading", action: "export" })
    try {
      const result = await window.electronAPI.sync.exportData(password)
      if (result.canceled) {
        setStatus({ type: "idle" })
        return
      }
      if (result.success) {
        setSuccess(`Backup saved to: ${result.filePath}`)
        setStatus({ type: "idle" })
      } else {
        setError(result.error ?? "Failed to create backup.")
        setStatus({ type: "idle" })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed.")
      setStatus({ type: "idle" })
    }
  }

  const handleImport = async (password: string, overwriteAttr = false) => {
    if (!importFilePath) return

    setStatus({ type: "loading", action: "import" })
    try {
      const result = await window.electronAPI.sync.importData(
        password,
        importFilePath,
        overwriteAttr,
      )
      if (result.canceled) {
        setStatus({ type: "idle" })
        return
      }
      if (result.success) {
        setSuccess(result.message ?? "Restore complete.")
        setStatus({ type: "idle" })
        setImportFilePath(null)
        if (onGroupsChanged) onGroupsChanged()
      } else {
        setError(result.error ?? "Failed to restore data.")
        setStatus({ type: "idle" })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.")
      setStatus({ type: "idle" })
    }
  }

  const startImportFlow = async () => {
    try {
      const result = await window.electronAPI.sync.pickImportFile()
      if (result.canceled || !result.filePath) return

      setImportFilePath(result.filePath)
      setPasswordModal({
        isOpen: true,
        action: "import",
        overwrite: false,
      })
    } catch {
      setError("Failed to open file picker.")
    }
  }

  const isBackingUp = status.type === "loading"

  const handleExportAuditLog = async () => {
    setIsExportingAuditLog(true)
    try {
      await attendanceManager.downloadAuditLog()
      setSuccess("Audit log downloaded.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export audit log.")
    } finally {
      setIsExportingAuditLog(false)
    }
  }

  return (
    <div className="max-w-auto space-y-6 px-10 pt-4 pb-10">
      {/* Statistics Overview */}
      <DatabaseStats
        groupsCount={groups.length}
        totalMembers={totalMembers}
        totalPersons={systemData.totalPersons}
      />

      {/* Backup & Restore Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Create Backup */}
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)]">
          <div className="flex-1 border-b border-white/6 px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <i className="fa-solid fa-download text-xs text-cyan-400" />
              <h4 className="text-xs font-semibold text-white">Export Database</h4>
            </div>
            <p className="text-[11px] leading-relaxed font-medium text-white/40">
              Exports an encrypted <code className="font-mono text-cyan-400/50">.facenox</code>{" "}
              database: members, history, and biometric profiles.
            </p>
          </div>
          <div className="mt-auto px-5 py-4">
            <button
              onClick={() => setPasswordModal({ isOpen: true, action: "export" })}
              disabled={isBackingUp}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-40">
              {isBackingUp && status.action === "export" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-export" />}
              Export
            </button>
          </div>
        </div>

        {/* Restore Backup */}
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)]">
          <div className="flex-1 border-b border-white/6 px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <i className="fa-solid fa-upload text-xs text-cyan-400" />
              <h4 className="text-xs font-semibold text-white">Import Database</h4>
            </div>
            <p className="text-[11px] leading-relaxed font-medium text-white/40">
              Restores from a <code className="font-mono text-cyan-400/50">.facenox</code> backup
              file. Requires the original password.
            </p>
          </div>
          <div className="mt-auto px-5 py-4">
            <button
              onClick={startImportFlow}
              disabled={isBackingUp}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-40">
              {isBackingUp && status.action === "import" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-import" />}
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Export */}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)]">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-xs text-cyan-400" />
              <h4 className="text-xs font-semibold text-white">Audit Log</h4>
            </div>
            <p className="text-[11px] leading-relaxed font-medium text-white/40">
              Download a CSV of all admin actions: consent changes, deletions, vault
              imports/exports. Required for DPA compliance review.
            </p>
          </div>
          <button
            onClick={handleExportAuditLog}
            disabled={isExportingAuditLog}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2 text-[11px] font-bold tracking-wider text-white/50 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white active:scale-95 disabled:opacity-40">
            {isExportingAuditLog ?
              <i className="fa-solid fa-circle-notch fa-spin" />
            : <i className="fa-solid fa-file-csv" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Password Prompt Modal */}
      <Modal
        isOpen={passwordModal.isOpen}
        onClose={() => {
          setPasswordModal({ ...passwordModal, isOpen: false })
          setPasswordInput("")
        }}
        title={passwordModal.action === "export" ? "Set Vault Password" : "Unlock Vault"}
        icon={
          <i
            className={`fa-solid ${
              passwordModal.action === "export" ? "fa-shield-halved" : "fa-lock"
            } text-cyan-400`}
          />
        }>
        <div className="space-y-4">
          <p className="text-[11px] leading-relaxed text-white/50">
            {passwordModal.action === "export" ?
              "Choose a strong password to encrypt your vault. You will need this password to restore your data later."
            : `Enter the password used to encrypt ${
                importFilePath?.split(/[\\/]/).pop() || "this vault"
              } to decrypt and restore your data.`
            }
          </p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-white/30">Vault Password</label>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passwordInput) {
                  const pass = passwordInput
                  setPasswordInput("")
                  setPasswordModal({ ...passwordModal, isOpen: false })
                  if (passwordModal.action === "export") {
                    handleExport(pass)
                  } else {
                    handleImport(pass, passwordModal.overwrite)
                  }
                }
              }}
              placeholder="Enter password..."
              className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2 text-xs text-white transition-all duration-300 outline-none focus:border-cyan-500/35 focus:bg-[rgba(28,35,44,0.82)] focus:ring-2 focus:ring-cyan-500/6"
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => {
                setPasswordModal({ ...passwordModal, isOpen: false })
                setPasswordInput("")
              }}
              className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
              Cancel
            </button>
            <button
              disabled={!passwordInput}
              onClick={() => {
                const pass = passwordInput
                setPasswordInput("")
                setPasswordModal({ ...passwordModal, isOpen: false })
                if (passwordModal.action === "export") {
                  handleExport(pass)
                } else {
                  handleImport(pass, passwordModal.overwrite)
                }
              }}
              className="min-w-25 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50">
              {passwordModal.action === "export" ? "Export" : "Import"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Search */}
      <div className="group/search relative mx-auto max-w-sm">
        <div className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/35 transition-colors group-focus-within/search:text-cyan-400">
          <i className="fa-solid fa-magnifying-glass text-[11px]"></i>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members or groups..."
          className="w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] py-2 pr-8 pl-9 text-[11px] font-medium text-white placeholder-white/25 transition-all duration-300 outline-none focus:border-cyan-500/35 focus:bg-[rgba(28,35,44,0.82)] focus:ring-2 focus:ring-cyan-500/6"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border-none bg-transparent p-0 text-white/30 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white/70">
            <i className="fa-solid fa-xmark text-[9px]"></i>
          </button>
        )}
      </div>

      {/* Groups with Members List */}
      <div className={`space-y-2 pb-4 ${filteredData.length === 0 ? "h-32" : "h-auto"}`}>
        {filteredData.length === 0 ?
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/6 bg-[rgba(22,28,36,0.52)] py-12 text-white/20">
            <i className="fa-solid fa-ghost mb-3 text-2xl opacity-50" />
            <div className="text-[11px] font-medium">No results found</div>
            {groups.length === 0 && (
              <div className="mt-1 text-[10px] italic">
                Create a group to begin managing members.
              </div>
            )}
          </div>
        : filteredData.map((group) => (
            <GroupEntry
              key={group.id}
              group={group}
              isExpanded={expandedGroups.has(group.id)}
              editingGroup={editingGroup}
              editingMember={editingMember}
              editValue={editValue}
              savingGroup={savingGroup}
              savingMember={savingMember}
              deletingGroup={deletingGroup}
              deletingMember={deletingMember}
              onToggle={toggleGroup}
              onStartEditingGroup={startEditingGroup}
              onStartEditingMember={startEditing}
              onEditValueChange={setEditValue}
              onSaveGroupEdit={saveGroupEdit}
              onSaveMemberEdit={saveEdit}
              onCancelEditing={cancelEditing}
              onDeleteGroup={handleDeleteGroup}
              onDeleteMember={handleDeleteMember}
            />
          ))
        }
      </div>

      {/* Clear Actions */}
      <div className="overflow-hidden">
        <div className="border-b border-white/5 py-2">
          <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-red-500/60">
            <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
            Danger Zone
          </h3>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex-1">
            <p className="mt-1 text-[11px] leading-relaxed font-bold tracking-tight text-white/35">
              Deleting groups is permanent. Face data is managed separately from records.
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleClearAllGroups}
              disabled={isLoading || deletingGroup === "all" || groups.length === 0}
              className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] font-black tracking-wider text-red-400 transition-all hover:bg-red-500/15 active:scale-95 disabled:opacity-20">
              {deletingGroup === "all" ?
                <i className="fa-solid fa-spinner fa-spin"></i>
              : <i className="fa-solid fa-layer-group"></i>}
              Clear Groups
            </button>

            <button
              onClick={onClearDatabase}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] font-black tracking-wider text-amber-500/70 transition-all hover:bg-amber-500/15 hover:text-amber-500 active:scale-95 disabled:opacity-20">
              <i className="fa-solid fa-user-slash"></i>
              Clear Face Data
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
