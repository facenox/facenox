import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { SettingsOverview, TimeHealthOverview } from "@/components/settings/types"
import type { AttendanceGroup } from "@/types/recognition"
import { useDatabaseManagement } from "@/components/settings/sections/hooks/useDatabaseManagement"
import { DatabaseStats } from "@/components/settings/sections/components/DatabaseStats"
import { GroupEntry } from "@/components/settings/sections/components/GroupEntry"
import { useDialog } from "@/components/shared"
import { Modal } from "@/components/common/Modal"
import { useUIStore } from "@/components/main/stores"
import { EmptyState } from "@/components/group/shared"

type BackupStatus = { type: "idle" } | { type: "loading"; action: "export" | "import" }

interface DatabaseProps {
  systemData: SettingsOverview
  timeHealthState: TimeHealthOverview
  onRefreshTimeHealth: () => void
  groups: AttendanceGroup[]
  isLoading: boolean
  onClearDatabase: (skipConfirmation?: boolean) => void
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
    isInitialLoad,
    toggleGroup,
    startEditing,
    startEditingGroup,
    cancelEditing,
    saveEdit,
    saveGroupEdit,
    handleDeleteGroup,
    handleDeleteMember,
    handleClearAllGroups,
    handlePurgeHistory,
    isPurgingHistory,
  } = useDatabaseManagement(groups, onGroupsChanged, dialog)

  const [isPaired, setIsPaired] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => setIsPaired(c.connected))
        .catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

  const { setError, setSuccess } = useUIStore()

  const [status, setStatus] = useState<BackupStatus>({ type: "idle" })
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean
    action: "export" | "import"
    overwrite?: boolean
  }>({ isOpen: false, action: "export" })
  const [importFilePath, setImportFilePath] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false)
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

  const formattedLocalTime =
    timeHealth?.current_time_local ?
      new Date(timeHealth.current_time_local).toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null
  const timeHealthDetails =
    timeHealthState.loading ? "Verifying clock accuracy..."
    : timeHealthStatus === "verified" ?
      "Verifies system clock is correct to prevent attendance tampering."
    : timeHealthStatus === "drift_detected" ?
      "Device clock is out of sync. Adjust date and time settings to prevent logging errors."
    : timeHealthStatus === "offline" ? "Cannot verify time online."
    : "Could not read the current time authority status."

  return (
    <motion.div
      layout="position"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex w-full max-w-[900px] flex-col space-y-16 px-10 pt-8 pb-20">
      {/* Statistics Overview */}
      <section>
        <DatabaseStats
          groupsCount={groups.length}
          totalMembers={systemData.totalMembers}
          totalPersons={systemData.totalPersons}
        />
      </section>

      {/* System Time */}
      <section className="space-y-6">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            System Time
          </h3>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h4 className="text-[15px] font-semibold text-white/90">System Clock</h4>
              {timeHealthState.loading ?
                <span className="inline-flex items-center gap-1.5 text-[12px] text-white/40">
                  <i className="fa-solid fa-circle-notch fa-spin text-[10px]" />
                  Checking time...
                </span>
              : timeHealthStatus === "verified" ?
                <span className="text-[12px] font-medium text-emerald-400">Synced</span>
              : timeHealthStatus === "drift_detected" ?
                <span className="text-[12px] text-amber-400/80">Drift warning</span>
              : timeHealthStatus === "offline" ?
                <span className="text-[12px] text-white/40">Cannot verify</span>
              : <span className="text-[12px] text-white/40">Status unavailable</span>}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{timeHealthDetails}</p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] tracking-tight text-white/55">
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
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-1.5 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97] disabled:opacity-40">
              {timeHealthState.loading ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-rotate-right" />}
              {timeHealthState.loading ? "Checking..." : "Check Now"}
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

      {/* Backup & Export */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Backup & Export
          </h3>
        </div>

        <div className="space-y-10">
          {/* Export */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Create Backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Save an encrypted{" "}
                <code className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-cyan-400/60">
                  .facenox
                </code>{" "}
                file containing all members, history, and face profiles.
              </p>
            </div>
            <button
              onClick={() => setPasswordModal({ isOpen: true, action: "export" })}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-2 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97] disabled:opacity-40">
              {status.type === "loading" && status.action === "export" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-export text-[11px] opacity-40" />}
              Create
            </button>
          </div>

          {/* Import */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Restore Backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Restore database from a backup file using its original encryption password.
                {isPaired && (
                  <span className="mt-1 block font-bold text-amber-500/80">
                    <i className="fa-solid fa-triangle-exclamation mr-1" />
                    Warning: Restoring this backup will overwrite the active connected directories
                    on the next sync pull.
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={startImportFlow}
              disabled={isBackingUp}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-2 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97] disabled:opacity-40">
              {status.type === "loading" && status.action === "import" ?
                <i className="fa-solid fa-circle-notch fa-spin" />
              : <i className="fa-solid fa-file-import text-[11px] opacity-40" />}
              Restore
            </button>
          </div>
        </div>
      </section>

      {/* Local Storage */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Local Storage
          </h3>
        </div>

        <div className="space-y-10">
          {/* Data Folder */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Open Database Folder</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Access local database files, logs, and biometric signatures on this device.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 self-start md:self-auto">
              <button
                onClick={async () => {
                  await window.facenoxElectron?.openDataDir()
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-2 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
                <i className="fa-regular fa-folder-open text-[11px] opacity-40" />
                Open Folder
              </button>
              <button
                onClick={async () => {
                  await window.facenoxElectron?.openLogFile()
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-2 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
                <i className="fa-regular fa-file-lines text-[11px] opacity-40" />
                Open Log
              </button>
            </div>
          </div>

          {/* Install Folder */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">
                Open Installation Directory
              </h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                View the core application resources and executable binary files.
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-tight text-amber-500/80">
                <i className="fa-solid fa-triangle-exclamation shrink-0" />
                <span>Modifying these files is not recommended.</span>
              </div>
            </div>
            <button
              onClick={async () => {
                await window.facenoxElectron?.openInstallDir()
              }}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-2 text-[12px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
              <i className="fa-regular fa-folder text-[11px] opacity-40" />
              Open Folder
            </button>
          </div>
        </div>
      </section>

      {/* All Groups */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="pt-2 pb-2">
            <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
              All Groups
            </h3>
          </div>
          <div className="group/search relative h-9 min-w-[280px]">
            <svg
              className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/search:text-white/45"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search group name or ID..."
              className="h-full w-full rounded-lg border border-white/5 bg-white/5 py-2 pr-7 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none group-focus-within/search:border-white/20 placeholder:text-white/30 focus:bg-white/[0.08]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-white/55 hover:text-white">
                <i className="fa-solid fa-xmark text-[9px]" />
              </button>
            )}
          </div>
        </div>

        <div className={!isInitialLoad && filteredData.length > 0 ? "border-t border-white/5" : ""}>
          <div
            className={`${isInitialLoad || filteredData.length === 0 ? "min-h-[200px]" : "h-auto"} divide-y divide-white/5`}>
            <AnimatePresence mode="wait">
              {isInitialLoad ?
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center py-12 text-white/20">
                  <i className="fa-solid fa-circle-notch fa-spin mb-3 text-2xl opacity-30" />
                  <div className="text-[12px] font-medium tracking-wide">Syncing directory...</div>
                </motion.div>
              : filteredData.length === 0 ?
                <EmptyState
                  key="empty"
                  className="py-12"
                  title={searchQuery.trim() ? "No results found" : "No groups found"}
                  description={
                    searchQuery.trim() ?
                      `No groups matched "${searchQuery}"`
                    : "Create a group to begin managing members."
                  }
                  iconClass={
                    searchQuery.trim() ?
                      "fa-solid fa-ghost text-2xl"
                    : "fa-solid fa-folder-open text-2xl"
                  }
                />
              : <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                  {filteredData.map((group, idx) => (
                    <GroupEntry
                      key={group.id || `group-${idx}`}
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
                      onGroupsChanged={onGroupsChanged}
                    />
                  ))}
                </motion.div>
              }
            </AnimatePresence>
          </div>
        </div>
      </section>

      <span className="sr-only">Danger Zone Toggle</span>
      {/* Danger Zone */}
      <motion.section
        layout="position"
        className="relative flex w-full flex-col items-center overflow-hidden pt-8 pb-2">
        {/* Sleek fading gradient divider to match the centered design */}
        <div className="absolute top-0 right-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
        {/* Sleek centered trigger */}
        <button
          onClick={() => setIsDangerZoneOpen(!isDangerZoneOpen)}
          className="group flex items-center gap-2.5 rounded-md border-0 bg-transparent px-5 py-2 text-[11px] font-extrabold tracking-[0.2em] text-red-500/40 uppercase shadow-none transition-all duration-300 outline-none hover:bg-red-500/[0.04] hover:text-red-400 focus:outline-none active:scale-95">
          <i className="fa-solid fa-triangle-exclamation text-[10px] opacity-60 transition-transform group-hover:scale-110" />
          <span>Danger Zone</span>
          <motion.i
            animate={{ rotate: isDangerZoneOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="fa-solid fa-chevron-down text-[9px] opacity-50"
          />
        </button>
        <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-white/40 select-none">
          Destructive actions and local data clearing
        </p>

        <AnimatePresence>
          {isDangerZoneOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full overflow-hidden">
              <div className="w-full divide-y divide-red-500/5 pt-4 pb-8">
                {/* Action 1: Clear Groups */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">
                      Clear Group Directory
                    </h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Permanently deletes all groups, member profiles, and their consent records.
                      This wipes out the entire local directory structure.{" "}
                      <span className="font-semibold text-white/80">
                        After clearing, consent must be re-granted for each member before
                        re-enrollment will work.
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleClearAllGroups(false)}
                    disabled={
                      isLoading || deletingGroup === "all" || groups.length === 0 || isPaired
                    }
                    className="flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border-0 bg-red-500/10 px-5 py-2 text-[12px] font-bold text-red-400 shadow-none transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-20 md:self-auto">
                    {deletingGroup === "all" && <i className="fa-solid fa-spinner fa-spin" />}
                    Clear Groups
                  </button>
                </div>

                {/* Action 2: Reset Face Data */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">Reset Face Data</h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Wipes all face recognition signatures. Enrolled members will need to re-enroll
                      their face profiles.
                      {isPaired && (
                        <span className="mt-1 block font-bold text-red-400/90">
                          <i className="fa-solid fa-lock mr-1" />
                          Disabled: Cannot reset face templates locally while connected to dashboard
                          directory.
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => onClearDatabase(false)}
                    disabled={isLoading || isPaired}
                    className="flex shrink-0 items-center justify-center self-start rounded-lg border-0 bg-red-500/10 px-5 py-2 text-[12px] font-bold text-red-400 shadow-none transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-20 md:self-auto">
                    Reset Face Data
                  </button>
                </div>

                {/* Action 3: Purge Attendance History */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">
                      Purge Attendance History
                    </h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Permanently wipes all daily attendance check-ins, checkout timestamps, and
                      history records. Configured groups, member profiles, and enrolled face
                      profiles will remain safe.
                      {isPaired && (
                        <span className="mt-1 block font-bold text-red-400/90">
                          <i className="fa-solid fa-lock mr-1" />
                          Disabled: Purging records locally is blocked while connected to prevent
                          synchronization gap.
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePurgeHistory(false)}
                    disabled={isLoading || isPurgingHistory || isPaired}
                    className="flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border-0 bg-red-500/10 px-5 py-2 text-[12px] font-bold text-red-400 shadow-none transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-20 md:self-auto">
                    {isPurgingHistory && <i className="fa-solid fa-spinner fa-spin" />}
                    Wipe History
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

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
          <p className="text-xs leading-relaxed text-white/65">
            {passwordModal.action === "export" ?
              "Choose a strong password to encrypt backups. This password is required to restore data later."
            : `Enter the password for ${
                importFilePath?.split(/[\\/]/).pop() || "this backup"
              } to decrypt and restore data.`
            }
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/55">Backup Password</label>
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
                className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] py-2 pr-10 pl-3 text-xs text-white transition-all duration-300 outline-none focus:border-white/20 focus:bg-[rgba(28,35,44,0.82)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 border-none bg-transparent p-0 text-white/55 shadow-none transition-colors hover:text-white/65 focus:outline-none"
                tabIndex={-1}>
                <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"} text-[12px]`} />
              </button>
            </div>
            {passwordModal.action === "export" && (
              <div className="flex items-start gap-1.5 pt-1 text-[11px] leading-tight text-amber-500/80">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
                <span>
                  Save this password securely. It is required to restore data and cannot be reset if
                  forgotten.
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
              className="rounded-lg border-0 bg-transparent px-4 py-2 text-[11px] font-medium text-white/65 shadow-none transition-colors hover:text-white active:scale-95">
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
              className="min-w-25 rounded-lg border-0 bg-cyan-500/10 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 shadow-none transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50">
              {passwordModal.action === "export" ? "Create" : "Restore"}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  )
}
