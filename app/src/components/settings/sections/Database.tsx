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
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean
    action: "export" | "import"
    overwrite?: boolean
  }>({ isOpen: false, action: "export" })
  const [importFilePath, setImportFilePath] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="mx-auto flex w-full max-w-[900px] flex-col space-y-16 px-10 pt-10 pb-20">
      {/* Statistics Overview */}
      <section>
        <DatabaseStats
          groupsCount={groups.length}
          totalMembers={systemData.totalMembers}
          totalPersons={systemData.totalPersons}
        />
      </section>

      {/* Device Time */}
      <section className="space-y-6">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/30 uppercase">
            Device Time & Status
          </h3>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h4 className={`text-[15px] font-semibold tracking-tight ${timeHealthTone}`}>
              {timeHealthSummary}
            </h4>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{timeHealthDetails}</p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] tracking-tight text-white/20">
              <i className="fa-solid fa-microchip opacity-50" />
              <span>
                {timeHealthState.loading ?
                  "Checking..."
                : timeHealth ?
                  `${formattedLocalTime ?? "Unavailable"} • ${getFriendlyTimeZoneLabel()}`
                : "Clock health unavailable."}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <button
              onClick={onRefreshTimeHealth}
              disabled={timeHealthState.loading}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-4 py-1.5 text-[12px] font-bold text-white/70 transition-all hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-40">
              {timeHealthState.loading ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-rotate-right" />}
              Check Now
            </button>

            {!timeHealthState.loading &&
              timeHealth &&
              timeHealthStatus === "drift_detected" &&
              typeof timeHealth.online_drift_seconds === "number" && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500/70">
                  <i className="fa-solid fa-triangle-exclamation" />
                  <span>{Math.abs(timeHealth.online_drift_seconds).toFixed(1)}s drift</span>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/30 uppercase">
            Data Management
          </h3>
        </div>

        <div className="space-y-10">
          {/* Export */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Create Backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
                Save an encrypted{" "}
                <code className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-cyan-400/60">
                  .facenox
                </code>{" "}
                file containing all members, history, and biometric profiles.
              </p>
            </div>
            <button
              onClick={() => setPasswordModal({ isOpen: true, action: "export" })}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 py-2 text-[12px] font-bold text-white transition-all hover:bg-white/15 active:scale-95 disabled:opacity-40">
              {isBackingUp && status.action === "export" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-export text-[11px] opacity-40" />}
              Create
            </button>
          </div>

          {/* Import */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Restore Backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
                Restore your database from a backup file using its original encryption password.
              </p>
            </div>
            <button
              onClick={startImportFlow}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 py-2 text-[12px] font-bold text-white transition-all hover:bg-white/15 active:scale-95 disabled:opacity-40">
              {isBackingUp && status.action === "import" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-import text-[11px] opacity-40" />}
              Restore
            </button>
          </div>

          {/* Audit Log */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Export Audit Log</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
                Download a CSV of admin actions, including consent changes, deletions, and backup
                activity.
              </p>
            </div>
            <button
              onClick={handleExportAuditLog}
              disabled={isExportingAuditLog}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-transparent px-5 py-2 text-[12px] font-bold text-white/60 transition-all hover:bg-white/5 hover:text-white active:scale-95 disabled:opacity-40">
              {isExportingAuditLog ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-download text-[11px] opacity-40" />}
              CSV Log
            </button>
          </div>
        </div>
      </section>

      {/* Stored Groups */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="pt-2 pb-2">
            <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/30 uppercase">
              Stored Groups
            </h3>
          </div>
          <div className="group/search relative min-w-[280px]">
            <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/20 transition-colors group-focus-within/search:text-cyan-400/50">
              <i className="fa-solid fa-magnifying-glass text-[11px]"></i>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups..."
              className="w-full rounded-md border-0 bg-white/5 py-2 pr-8 pl-9 text-[12px] font-medium text-white placeholder-white/20 transition-all outline-none focus:bg-white/[0.08] focus:ring-1 focus:ring-cyan-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-white/20 hover:bg-white/10 hover:text-white">
                <i className="fa-solid fa-xmark text-[10px]"></i>
              </button>
            )}
          </div>
        </div>

        <div>
          <div className={`${filteredData.length === 0 ? "h-32" : "h-auto"} space-y-1`}>
            {filteredData.length === 0 ?
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/5 bg-white/[0.01] py-12 text-white/20">
                <i className="fa-solid fa-folder-open mb-3 text-2xl opacity-30" />
                <div className="text-[12px] font-medium tracking-wide">No results found</div>
                {groups.length === 0 && (
                  <div className="mt-1 text-[11px] text-white/10">
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
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-6 pt-4">
        <div className="pt-4 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-red-500/50 uppercase">
            Danger Zone
          </h3>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <p className="text-[13px] leading-relaxed text-white/45">
              Deleting groups or members is permanent. Face data is the biometric information used
              for recognition. Clearing it will require members to re-register.
            </p>
          </div>

          <div className="flex shrink-0 gap-3">
            <button
              onClick={handleClearAllGroups}
              disabled={isLoading || deletingGroup === "all" || groups.length === 0}
              className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-[12px] font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-40">
              {deletingGroup === "all" ?
                <i className="fa-solid fa-spinner fa-spin"></i>
              : <i className="fa-solid fa-trash-can text-[11px] opacity-60" />}
              Clear Groups
            </button>

            <button
              onClick={onClearDatabase}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-[12px] font-bold text-amber-500 transition-all hover:bg-amber-500/20 active:scale-95 disabled:opacity-40">
              <i className="fa-solid fa-face-viewfinder text-[11px] opacity-60" />
              Reset Face Data
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
          setShowPassword(false)
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
          <p className="text-[11px] leading-relaxed text-white/45">
            {passwordModal.action === "export" ?
              "Choose a strong password to encrypt your backup. You will need this password to restore your data later."
            : `Enter the password for ${
                importFilePath?.split(/[\\/]/).pop() || "this backup"
              } to decrypt and restore your data.`
            }
          </p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-white/30">Backup Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && passwordInput) {
                    const pass = passwordInput
                    setPasswordInput("")
                    setShowPassword(false)
                    setPasswordModal({ ...passwordModal, isOpen: false })
                    if (passwordModal.action === "export") {
                      handleExport(pass)
                    } else {
                      handleImport(pass, passwordModal.overwrite)
                    }
                  }
                }}
                placeholder="Enter password..."
                className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] py-2 pr-10 pl-3 text-xs text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 border-none bg-transparent p-0 text-white/30 shadow-none transition-colors hover:text-white/60 focus:outline-none"
                tabIndex={-1}>
                <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"} text-[12px]`} />
              </button>
            </div>
            {passwordModal.action === "export" && (
              <div className="flex items-start gap-1.5 pt-1 text-[10px] leading-tight text-amber-500/80">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
                <span>
                  Save this password securely. It is required to restore your data and cannot be
                  reset if forgotten.
                </span>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => {
                setPasswordModal({ ...passwordModal, isOpen: false })
                setPasswordInput("")
                setShowPassword(false)
              }}
              className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
              Cancel
            </button>
            <button
              disabled={!passwordInput}
              onClick={() => {
                const pass = passwordInput
                setPasswordInput("")
                setShowPassword(false)
                setPasswordModal({ ...passwordModal, isOpen: false })
                if (passwordModal.action === "export") {
                  handleExport(pass)
                } else {
                  handleImport(pass, passwordModal.overwrite)
                }
              }}
              className="min-w-25 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50">
              {passwordModal.action === "export" ? "Create" : "Restore"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
