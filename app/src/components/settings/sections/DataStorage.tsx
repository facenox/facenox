import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Loader2,
  FileUp,
  FileDown,
  Info,
  Cloud,
  ArrowRight,
  Clock,
  Folder,
  FolderOpen,
  FileText,
  ChevronDown,
  Lock,
  Shield,
  Eye,
  EyeOff,
  CloudUpload,
} from "lucide-react"
import type { SettingsOverview } from "@/components/settings/types"
import type { AttendanceGroup } from "@/types/recognition"
import { useDatabaseManagement } from "@/components/settings/sections/hooks/useDatabaseManagement"
import { DatabaseStats } from "@/components/settings/sections/components/DatabaseStats"
import { useDialog, Switch } from "@/components/shared"
import { Modal } from "@/components/common/Modal"
import { useUIStore } from "@/components/main/stores"

type BackupStatus = { type: "idle" } | { type: "loading"; action: "export" | "import" }

interface DataStorageProps {
  systemData: SettingsOverview
  groups: AttendanceGroup[]
  isLoading: boolean
  onClearDatabase: (skipConfirmation?: boolean) => void
  onGroupsChanged?: () => void
  onNavigateToSync?: () => void
}

export function DataStorage({
  systemData,
  groups,
  isLoading,
  onClearDatabase,
  onGroupsChanged,
  onNavigateToSync,
}: DataStorageProps) {
  const dialog = useDialog()
  const { handleClearAllGroups, handlePurgeHistory, isPurgingHistory, deletingGroup } =
    useDatabaseManagement(groups, onGroupsChanged, dialog, false)

  const [isPaired, setIsPaired] = useState(false)
  const [allowKioskDirectoryManagement, setAllowKioskDirectoryManagement] = useState(true)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => {
          setIsPaired(c.connected)
          setAllowKioskDirectoryManagement(
            (c as { allowKioskDirectoryManagement?: boolean }).allowKioskDirectoryManagement !==
              false,
          )
        })
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

  // Auto-Export configuration state
  const [autoExportConfig, setAutoExportConfig] = useState<{
    enabled: boolean
    time: string
    directory: string
    format: "excel_workbook" | "individual_csvs" | "combined_csv"
    lastExportedDate: string | null
  }>({
    enabled: false,
    time: "17:00",
    directory: "",
    format: "excel_workbook",
    lastExportedDate: null,
  })
  const [isTriggeringAutoExport, setIsTriggeringAutoExport] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.autoExport) return
    window.electronAPI.autoExport
      .getConfig()
      .then((cfg) => setAutoExportConfig(cfg))
      .catch(console.error)
  }, [])

  const handleUpdateAutoExport = async (
    updates: Partial<{
      enabled: boolean
      time: string
      directory: string
      format: "excel_workbook" | "individual_csvs" | "combined_csv"
    }>,
  ) => {
    if (!window.electronAPI?.autoExport) return
    try {
      const updated = await window.electronAPI.autoExport.updateConfig(updates)
      setAutoExportConfig(updated)
    } catch (err) {
      console.error("Failed to update auto export config:", err)
      setError("Failed to save auto-export setting.")
    }
  }

  const handleSelectExportDirectory = async () => {
    if (!window.electronAPI?.autoExport) return
    try {
      const res = await window.electronAPI.autoExport.selectDirectory()
      if (!res.canceled && typeof res.path === "string") {
        const selectedDir = res.path
        setAutoExportConfig((prev) => ({ ...prev, directory: selectedDir }))
        setSuccess(`Export directory set to: ${selectedDir}`)
      }
    } catch (err) {
      console.error("Failed to select directory:", err)
      setError("Failed to open folder picker.")
    }
  }

  const handleOpenExportDirectory = async () => {
    if (!window.electronAPI?.autoExport) return
    try {
      await window.electronAPI.autoExport.openDirectory()
    } catch (err) {
      console.error("Failed to open directory:", err)
      setError("Failed to open folder.")
    }
  }

  const handleTriggerAutoExportNow = async () => {
    if (!window.electronAPI?.autoExport) return
    setIsTriggeringAutoExport(true)
    try {
      const success = await window.electronAPI.autoExport.triggerNow()
      if (success) {
        setSuccess("Daily attendance report exported.")
        const updated = await window.electronAPI.autoExport.getConfig()
        setAutoExportConfig(updated)
      } else {
        setError("Failed to export daily report. Check logs for details.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run export.")
    } finally {
      setIsTriggeringAutoExport(false)
    }
  }

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return { time: "--:--", period: "AM" }
    const [hStr, mStr] = timeStr.split(":")
    const h = parseInt(hStr, 10)
    const period = h >= 12 ? "PM" : "AM"
    const displayHours = h % 12 || 12
    return { time: `${displayHours}:${mStr}`, period }
  }
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

      {/* Backup & Export */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Backup & export
          </h3>
        </div>

        <div className="space-y-10">
          {/* Export */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Create backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Save an encrypted{" "}
                <code className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-cyan-400/60">
                  .facenox
                </code>{" "}
                file containing all members, attendance records, and enrolled face data.
              </p>
            </div>
            <button
              onClick={() => setPasswordModal({ isOpen: true, action: "export" })}
              disabled={isBackingUp}
              className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97] disabled:opacity-40">
              {status.type === "loading" && status.action === "export" ?
                <Loader2 className="size-3 animate-spin" />
              : <FileUp className="size-3 text-white/50" />}
              <span>Create</span>
            </button>
          </div>

          {/* Import */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Restore backup</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Restore database from a backup file using its original encryption password.
                {isPaired && (
                  <span className="mt-1 block font-medium text-amber-500/80">
                    <Info className="mr-1 inline size-3" />
                    Restored groups and members will sync to the cloud.
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={startImportFlow}
              disabled={isBackingUp}
              className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97] disabled:opacity-40">
              {status.type === "loading" && status.action === "import" ?
                <Loader2 className="size-3 animate-spin" />
              : <FileDown className="size-3 text-white/50" />}
              <span>Restore</span>
            </button>
          </div>

          {/* Subtle contextual bridge when operating standalone */}
          {!isPaired && onNavigateToSync && (
            <div className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2.5 text-xs text-white/65">
                <Cloud className="size-3 text-emerald-400" />
                <span>Want to review synced records from a browser?</span>
              </div>
              <button
                type="button"
                onClick={onNavigateToSync}
                className="group flex items-center gap-1.5 text-xs font-semibold text-cyan-400 transition-colors hover:text-cyan-300">
                <span>Set up cloud sync</span>
                <ArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Scheduled Daily Reports (Offline Auto-Export) */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Scheduled reports
          </h3>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="text-[15px] font-semibold text-white/90">Daily auto-export</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                  Export daily attendance reports to a local or network folder at the scheduled time
                  while Facenox is running.
                </p>
              </div>
              <Switch
                checked={autoExportConfig.enabled}
                onChange={(enabled) => handleUpdateAutoExport({ enabled })}
                ariaLabel="Enable daily auto-export"
              />
            </div>

            <AnimatePresence>
              {autoExportConfig.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="flex flex-col pt-3">
                    {/* Export Time */}
                    <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                      <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                      <div className="pointer-events-none absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-white/10" />

                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/65">Scheduled time:</div>
                      </div>
                      <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/20 hover:border-white/20 hover:bg-white/8">
                        <Clock className="mr-2 size-3 text-white/40 transition-colors group-hover:text-white/70" />
                        <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                          <span>{formatTimeDisplay(autoExportConfig.time).time}</span>
                          <span className="text-[10px] font-medium text-white/55">
                            {formatTimeDisplay(autoExportConfig.time).period}
                          </span>
                        </div>
                        <input
                          type="time"
                          title=""
                          value={autoExportConfig.time}
                          onChange={(e) => handleUpdateAutoExport({ time: e.target.value })}
                          onClick={(e) => e.currentTarget.showPicker?.()}
                          aria-label="Auto export time"
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                    </div>

                    {/* Export Format */}
                    <div className="relative flex flex-wrap items-center justify-between gap-3 pt-2.5 pb-2.5 pl-4">
                      <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                      <div className="pointer-events-none absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-white/10" />

                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/65">Report format:</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {[
                          { id: "excel_workbook", label: "Excel (.xls)" },
                          { id: "individual_csvs", label: "Per-group CSV" },
                          { id: "combined_csv", label: "Combined CSV" },
                        ].map((fmt) => (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() =>
                              handleUpdateAutoExport({
                                format: fmt.id as
                                  "excel_workbook" | "individual_csvs" | "combined_csv",
                              })
                            }
                            className={`relative py-1 text-center text-[11px] font-bold tracking-wider transition-all duration-150 ${
                              autoExportConfig.format === fmt.id ?
                                "text-cyan-400"
                              : "text-white/40 hover:text-white/70"
                            }`}>
                            {fmt.label}
                            {autoExportConfig.format === fmt.id && (
                              <motion.div
                                layoutId="exportFormatUnderline"
                                className="absolute right-0 bottom-[-3px] left-0 h-[2px] rounded-[1px] bg-cyan-400"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Destination Folder */}
                    <div className="relative flex flex-col gap-2 pt-2.5 pb-2.5 pl-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                      <div className="pointer-events-none absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-white/10" />

                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/65">Save location:</div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-white/45 select-all">
                          {autoExportConfig.directory || "Documents/Facenox_Reports"}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectExportDirectory}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-white/75 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
                          <Folder className="size-3 text-white/50" />
                          <span>Change</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenExportDirectory}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-white/75 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
                          <FolderOpen className="size-3 text-white/50" />
                          <span>Open folder</span>
                        </button>
                      </div>
                    </div>

                    {/* Status & Export Now */}
                    <div className="relative flex flex-wrap items-center justify-between gap-3 pt-2.5 pb-2.5 pl-4">
                      <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                      <div className="min-w-0 flex-1 text-[11px] text-white/45">
                        {autoExportConfig.lastExportedDate ?
                          <span>
                            Last export:{" "}
                            <span className="font-mono font-medium text-white/65">
                              {autoExportConfig.lastExportedDate}
                            </span>
                          </span>
                        : <span>No export recorded today</span>}
                      </div>

                      <button
                        type="button"
                        onClick={handleTriggerAutoExportNow}
                        disabled={isTriggeringAutoExport}
                        className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-white/80 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-40">
                        {isTriggeringAutoExport ?
                          <Loader2 className="size-3 animate-spin text-[10px]" />
                        : <FileUp className="size-3" />}
                        <span>{isTriggeringAutoExport ? "Exporting…" : "Export now"}</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Local Storage */}
      <section className="space-y-8">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Local storage
          </h3>
        </div>

        <div className="space-y-10">
          {/* Data Folder */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Database and system logs</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Access local database files, diagnostic logs, and enrolled face data on this device.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 self-start md:self-auto">
              <button
                type="button"
                aria-label="Open data folder"
                onClick={async () => {
                  await window.facenoxElectron?.openDataDir()
                }}
                className="flex h-8 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
                <FolderOpen className="size-3 text-white/50" />
                <span>Open folder</span>
              </button>
              <button
                type="button"
                aria-label="View system log"
                onClick={async () => {
                  await window.facenoxElectron?.openLogFile()
                }}
                className="flex h-8 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
                <FileText className="size-3 text-white/50" />
                <span>View log</span>
              </button>
            </div>
          </div>

          {/* Install Folder */}
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="text-[15px] font-semibold text-white/90">Installation directory</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                Open the folder where Facenox is installed.
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-tight text-amber-500/80">
                <AlertTriangle className="size-3 shrink-0" />
                <span>Modifying these files is not recommended.</span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Open installation directory"
              onClick={async () => {
                await window.facenoxElectron?.openInstallDir()
              }}
              className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
              <FolderOpen className="size-3 text-white/50" />
              <span>Open folder</span>
            </button>
          </div>
        </div>
      </section>

      <span className="sr-only">Danger zone toggle</span>
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
          <AlertTriangle className="size-2.5 opacity-60 transition-transform group-hover:scale-110" />
          <span>Danger zone</span>
          <motion.span
            animate={{ rotate: isDangerZoneOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}>
            <ChevronDown className="size-2.5 opacity-50" />
          </motion.span>
        </button>

        <AnimatePresence>
          {isDangerZoneOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full overflow-hidden">
              <div className="w-full divide-y divide-red-500/5 pt-4 pb-8">
                {/* Action 1: Delete Group Directory */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">
                      Delete group directory
                    </h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Permanently delete all groups, member profiles, and enrolled face data.
                      Members must be re-created and enrolled for recognition to work.
                      {isPaired &&
                        (!allowKioskDirectoryManagement ?
                          <span className="mt-1 block font-medium text-amber-400/80">
                            <Lock className="mr-1 inline size-3" />
                            Your organization has disabled directory deletion on this computer.
                            Manage groups in Facenox Cloud.
                          </span>
                        : <span className="mt-1 block font-medium text-amber-400/80">
                            <CloudUpload className="mr-1 inline size-3" />
                            This will also delete groups from your cloud directory.
                          </span>)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleClearAllGroups(false)}
                    disabled={
                      isLoading ||
                      deletingGroup === "all" ||
                      groups.length === 0 ||
                      (isPaired && !allowKioskDirectoryManagement)
                    }
                    className="flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-rose-500/25 bg-rose-500/10 px-5 py-2 text-[12px] font-bold text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 active:scale-95 disabled:opacity-20 md:self-center">
                    {deletingGroup === "all" && <Loader2 className="size-3 animate-spin" />}
                    Delete directory
                  </button>
                </div>

                {/* Action 2: Clear Face Data */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">Clear face data</h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Wipe all enrolled biometric face data. Enrolled members will need to be
                      re-enrolled.
                      {isPaired &&
                        (!allowKioskDirectoryManagement ?
                          <span className="mt-1 block font-medium text-amber-400/80">
                            <Lock className="mr-1 inline size-3" />
                            Your organization has disabled face-data removal on this computer.
                            Contact your administrator.
                          </span>
                        : <span className="mt-1 block font-medium text-amber-400/80">
                            <CloudUpload className="mr-1 inline size-3" />
                            Face data will also be cleared from the cloud.
                          </span>)}
                    </p>
                  </div>
                  <button
                    onClick={() => onClearDatabase(false)}
                    disabled={isLoading || (isPaired && !allowKioskDirectoryManagement)}
                    className="flex shrink-0 items-center justify-center self-start rounded-lg border border-rose-500/25 bg-rose-500/10 px-5 py-2 text-[12px] font-bold text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 active:scale-95 disabled:opacity-20 md:self-center">
                    Clear face data
                  </button>
                </div>

                {/* Action 3: Purge Attendance History */}
                <div className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-[15px] font-semibold text-red-400/80">
                      Purge attendance history
                    </h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      Permanently wipe all daily attendance check-ins, checkout timestamps, and
                      history records on this device. Groups, member profiles, and enrolled face
                      data are preserved.
                      {isPaired && (
                        <span className="mt-1 block font-medium text-white/50">
                          <Cloud className="mr-1 inline size-3" />
                          Clears history on this device only. Cloud records are unchanged.
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePurgeHistory(false)}
                    disabled={isLoading || isPurgingHistory}
                    className="flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-rose-500/25 bg-rose-500/10 px-5 py-2 text-[12px] font-bold text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 active:scale-95 disabled:opacity-20 md:self-center">
                    {isPurgingHistory && <Loader2 className="size-3 animate-spin" />}
                    Purge history
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
        title={passwordModal.action === "export" ? "Set backup password" : "Restore backup"}
        icon={
          passwordModal.action === "export" ?
            <Shield className="size-4 text-cyan-400" />
          : <Lock className="size-4 text-cyan-400" />
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
            <label className="text-xs font-medium text-white/55">Backup password</label>
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
                placeholder="Enter password…"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pr-10 pl-3 text-xs text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-300 outline-none focus:border-white/25 focus:bg-white/[0.08]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 border-none bg-transparent p-0 text-white/55 shadow-none transition-colors hover:text-white/65 focus:outline-none"
                tabIndex={-1}>
                {showPassword ?
                  <EyeOff className="size-3 text-white/55" />
                : <Eye className="size-3 text-white/55" />}
              </button>
            </div>
            {passwordModal.action === "export" && (
              <div className="flex items-start gap-1.5 pt-1 text-[11px] leading-tight text-amber-500/80">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
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
