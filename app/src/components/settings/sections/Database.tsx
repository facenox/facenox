import { useState } from "react"
import type { SettingsOverview, TimeHealthOverview } from "@/components/settings/types"
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
  timeHealthState: TimeHealthOverview
  onRefreshTimeHealth: () => void
  groups: AttendanceGroup[]
  isLoading: boolean
  onClearDatabase: () => void
  onGroupsChanged?: () => void
}

export function Database({
  systemData,
  timeHealthState,
  onRefreshTimeHealth,
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
  } = useDatabaseManagement(groups, onGroupsChanged, dialog)

  const { setError, setSuccess } = useUIStore()

  const [status, setStatus] = useState<BackupStatus>({ type: "idle" })
  const [isExportingAuditLog, setIsExportingAuditLog] = useState(false)
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false)
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

  const getFriendlyTimeZoneLabel = (): string => {
    const health = timeHealthState.timeHealth
    if (!health?.current_time_local) {
      return "Local Time"
    }

    const localDate = new Date(health.current_time_local)
    const offsetMinutes = -localDate.getTimezoneOffset()
    const offsetSign = offsetMinutes >= 0 ? "+" : "-"
    const absoluteOffset = Math.abs(offsetMinutes)
    const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0")
    const offsetRemainderMinutes = String(absoluteOffset % 60).padStart(2, "0")
    const utcOffsetLabel = `UTC${offsetSign}${offsetHours}:${offsetRemainderMinutes}`

    let ianaLabel: string | null
    try {
      ianaLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      ianaLabel = null
    }

    if (ianaLabel) {
      return `${ianaLabel} (${utcOffsetLabel})`
    }

    if (health.time_zone_name?.trim()) {
      return `${health.time_zone_name.trim()} (${utcOffsetLabel})`
    }

    return utcOffsetLabel
  }

  const timeHealth = timeHealthState.timeHealth
  const timeHealthStatus = timeHealth?.online_verification_status ?? "unavailable"
  const timeHealthTone =
    timeHealthStatus === "verified" ? "text-cyan-400/80"
    : timeHealthStatus === "drift_detected" ? "text-amber-400/90"
    : "text-white/50"
  const formattedLocalTime =
    timeHealth?.current_time_local ?
      new Date(timeHealth.current_time_local).toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null
  const timeHealthSummary =
    timeHealthState.loading ? "Checking your device time..."
    : timeHealthStatus === "verified" ? "Time verified."
    : timeHealthStatus === "drift_detected" ? "Your device time may need attention."
    : timeHealthStatus === "offline" ? "Online time checking is unavailable right now."
    : "Time status is unavailable right now."
  const timeHealthDetails =
    timeHealthState.loading ? "Please wait while Facenox checks the current time."
    : timeHealthStatus === "verified" ? "Your device time is correct."
    : timeHealthStatus === "drift_detected" ?
      "Please check your computer's date, time, and timezone settings."
    : timeHealthStatus === "offline" ?
      "Facenox still works offline, but it cannot verify internet time right now."
    : "Facenox could not read the current time status."

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col space-y-10 px-10 pt-8 pb-16">
      {/* Statistics Overview */}
      <section>
        <DatabaseStats
          groupsCount={groups.length}
          totalMembers={systemData.totalMembers}
          totalPersons={systemData.totalPersons}
        />
      </section>

      {/* Device Time */}
      <section>
        <div className="mb-6">
          <h2 className="text-[14px] font-semibold text-white">Device Time & Status</h2>
          <p className="mt-1 text-[13px] text-white/40">
            Check if your local system time is accurate for logging.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className={`text-[13px] font-medium ${timeHealthTone}`}>{timeHealthSummary}</h4>
            <p className="mt-1 text-[13px] text-white/40">{timeHealthDetails}</p>
            <p className="mt-1.5 font-mono text-[11px] text-white/30">
              {timeHealthState.loading ?
                "Checking..."
              : timeHealth ?
                `${formattedLocalTime ?? "Unavailable"} • ${getFriendlyTimeZoneLabel()}`
              : "Clock health unavailable."}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <button
              onClick={onRefreshTimeHealth}
              disabled={timeHealthState.loading}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
              {timeHealthState.loading ?
                <i className="fa-solid fa-circle-notch fa-spin text-[11px]" />
              : <i className="fa-solid fa-rotate-right text-[11px]" />}
              Check Again
            </button>

            {!timeHealthState.loading &&
              timeHealth &&
              timeHealthStatus === "drift_detected" &&
              typeof timeHealth.online_drift_seconds === "number" && (
                <span className="text-[11px] text-white/45">
                  {Math.abs(timeHealth.online_drift_seconds).toFixed(1)}s difference
                </span>
              )}
          </div>
        </div>
      </section>

      {/* Backup & Restore */}
      <section>
        <div className="mb-6">
          <h2 className="text-[14px] font-semibold text-white">Data Management</h2>
          <p className="mt-1 text-[13px] text-white/40">
            Securely backup your configuration, or export activity logs.
          </p>
        </div>

        <div className="space-y-6">
          {/* Export */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-medium text-white">Export Database</h4>
              <p className="mt-1 text-[13px] text-white/40">
                Save an encrypted{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px]">
                  .facenox
                </code>{" "}
                backup with members, history, and biometric profiles.
              </p>
            </div>
            <button
              onClick={() => setPasswordModal({ isOpen: true, action: "export" })}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-40">
              {isBackingUp && status.action === "export" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : null}
              Export
            </button>
          </div>

          {/* Import */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-medium text-white">Import Database</h4>
              <p className="mt-1 text-[13px] text-white/40">
                Restore from a backup file using its original encryption password.
              </p>
            </div>
            <button
              onClick={startImportFlow}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-40">
              {isBackingUp && status.action === "import" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : null}
              Import
            </button>
          </div>

          {/* Audit Log */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-medium text-white">Export Audit Log</h4>
              <p className="mt-1 text-[13px] text-white/40">
                Download a CSV of admin actions, including consent changes, deletions, and backup
                activity.
              </p>
            </div>
            <button
              onClick={handleExportAuditLog}
              disabled={isExportingAuditLog}
              className="flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-transparent px-4 py-2 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40">
              {isExportingAuditLog ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-download" />}
              CSV Log
            </button>
          </div>
        </div>
      </section>

      {/* Password Prompt Modal */}
      <Modal
        isOpen={passwordModal.isOpen}
        onClose={() => {
          setPasswordModal({ ...passwordModal, isOpen: false })
          setPasswordInput("")
        }}
        title={passwordModal.action === "export" ? "Set Backup Password" : "Restore Backup"}
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
              "Choose a strong password to encrypt your backup. You will need this password to restore your data later."
            : `Enter the password for ${
                importFilePath?.split(/[\\/]/).pop() || "this backup"
              } to decrypt and restore your data.`
            }
          </p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-white/30">Backup Password</label>
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
              className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-2 text-xs text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
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

      {/* Groups Section */}
      <section>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Groups</h2>
            <p className="mt-1 text-[13px] text-white/40">
              Browse stored groups and manage their members.
            </p>
          </div>

          <div className="group/search relative w-full max-w-sm">
            <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/30 transition-colors group-focus-within/search:text-white/60">
              <i className="fa-solid fa-magnifying-glass text-[12px]"></i>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members or groups..."
              className="w-full rounded-md border-0 bg-white/5 py-2 pr-8 pl-8 text-[13px] font-medium text-white placeholder-white/30 transition-all outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-white/30 hover:bg-white/10 hover:text-white">
                <i className="fa-solid fa-xmark text-[10px]"></i>
              </button>
            )}
          </div>
        </div>

        <div className={`${filteredData.length === 0 ? "h-32" : "h-auto"} space-y-1`}>
          {filteredData.length === 0 ?
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-transparent py-12 text-white/30">
              <i className="fa-solid fa-ghost mb-3 text-2xl" />
              <div className="text-[12px] font-medium">No results found</div>
              {groups.length === 0 && (
                <div className="mt-1 text-[11px]">Create a group to begin managing members.</div>
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
      </section>

      {/* Clear Actions */}
      <section>
        <button
          type="button"
          onClick={() => setIsDangerZoneOpen((current) => !current)}
          className="group flex w-full items-center justify-between text-left transition-colors">
          <span className="text-[14px] font-semibold text-red-500/80 group-hover:text-red-500">
            Danger Zone
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/30 group-hover:text-white/50">
            {isDangerZoneOpen ? "Hide" : "Show"}
            <i className={`fa-solid fa-chevron-${isDangerZoneOpen ? "up" : "down"} text-[10px]`} />
          </span>
        </button>

        {isDangerZoneOpen ?
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <p className="text-[13px] text-white/40">
                Deleting groups is permanent. Face data is managed separately from records.
              </p>
            </div>

            <div className="flex shrink-0 gap-3">
              <button
                onClick={handleClearAllGroups}
                disabled={isLoading || deletingGroup === "all" || groups.length === 0}
                className="flex items-center gap-2 rounded-md bg-red-500/10 px-4 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40">
                {deletingGroup === "all" ?
                  <i className="fa-solid fa-spinner fa-spin"></i>
                : null}
                Clear Groups
              </button>

              <button
                onClick={onClearDatabase}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-40">
                Clear Face Data
              </button>
            </div>
          </div>
        : <p className="mt-1 text-[13px] text-white/20">
            Destructive actions are hidden by default.
          </p>
        }
      </section>
    </div>
  )
}
