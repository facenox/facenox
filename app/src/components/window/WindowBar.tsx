import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Tooltip } from "@/components/shared"
import { updaterService } from "@/services"
import type { UpdateInfo } from "@/types/updater"
import { Modal, Spinner } from "@/components/common"
import { useUIStore } from "@/components/main/stores/uiStore"

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never"
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (isNaN(diffMs)) return "Never"

    const diffSecs = Math.floor(diffMs / 1000)
    if (diffSecs < 10) return "Just now"
    if (diffSecs < 60) return `${diffSecs}s ago`

    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return "Never"
  }
}

/**
 * Custom Title Bar Component
 * Renders window controls, database sync status dot, and "Update Available" notification action.
 * Leverages frameless window configuration under Electron drag regions.
 */
export default function WindowBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateCheckState, setUpdateCheckState] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "error" | "offline"
  >("idle")
  const [checkedUpdateInfo, setCheckedUpdateInfo] = useState<UpdateInfo | null>(null)

  const handleCheckUpdates = useCallback(async () => {
    setIsUpdateModalOpen(true)
    setUpdateCheckState("checking")
    try {
      const info = await updaterService.checkForUpdates(true)
      setCheckedUpdateInfo(info)
      if (info.hasUpdate) {
        setUpdateCheckState("available")
      } else if (info.isOffline) {
        setUpdateCheckState("offline")
      } else if (info.error) {
        setUpdateCheckState("error")
      } else {
        setUpdateCheckState("up-to-date")
      }
    } catch (err) {
      console.error(err)
      setUpdateCheckState("error")
    }
  }, [])
  const [syncConfig, setSyncConfig] = useState<{
    connected: boolean
    enabled: boolean
    lastSyncedAt: string | null
    lastSyncStatus: "idle" | "success" | "error"
    lastSyncMessage: string | null
    unsyncedRecordsCount?: number
    unsyncedSessionsCount?: number
  } | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync.getConfig().then(setSyncConfig).catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    // Listen for updates found by background check cycles
    const unsubscribe = updaterService.onUpdateInfoChanged((info) => {
      setUpdateInfo(info)
    })
    return unsubscribe
  }, [])

  const handleOpenRelease = () => {
    updaterService.openReleasePage("https://facenox.com/download")
  }

  useEffect(() => {
    const handleMaximize = () => setIsMaximized(true)
    const handleUnmaximize = () => setIsMaximized(false)

    let cleanupMaximize: (() => void) | undefined
    let cleanupUnmaximize: (() => void) | undefined

    if (window.facenoxElectron) {
      cleanupMaximize = window.facenoxElectron.onMaximize(handleMaximize)
      cleanupUnmaximize = window.facenoxElectron.onUnmaximize(handleUnmaximize)
    }

    return () => {
      if (cleanupMaximize) cleanupMaximize()
      if (cleanupUnmaximize) cleanupUnmaximize()
    }
  }, [])

  const handleMinimize = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.minimize()
    }
  }

  const handleMaximize = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.maximize()
    }
  }

  const handleClose = () => {
    if (window.facenoxElectron) {
      window.facenoxElectron.close()
    }
  }

  const platform = window.facenoxElectron?.platform || "win32"
  const isLinux = platform === "linux"
  const isMac = platform === "darwin"

  const iconStyle = (iconName: string) => ({
    maskImage: `url(./icons/window/${iconName}.svg)`,
    WebkitMaskImage: `url(./icons/window/${iconName}.svg)`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "10px",
    WebkitMaskSize: "10px",
  })

  return (
    <div
      className="relative flex h-[32px] w-full shrink-0 items-center justify-between border-b border-white/8 select-none"
      style={
        {
          WebkitAppRegion: isMaximized ? "no-drag" : "drag",
        } as React.CSSProperties
      }>
      {/* Spacer for Mac native traffic lights */}
      {isMac && <div className="w-[80px] shrink-0" />}

      <div className="relative z-40 ml-3 flex flex-1 items-center gap-2">
        <div className="flex items-center gap-1.5">
          <img
            src="./icons/logo-transparent.png"
            alt="Facenox"
            className={`${isMac ? "-ml-4" : ""} pointer-events-none h-4 w-4 object-contain opacity-60`}
          />
          <div
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className="pointer-events-auto relative flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`flex h-5 w-5 items-center justify-center rounded border border-transparent bg-transparent text-white/40 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white/80 focus:outline-none active:scale-95 ${
                isMenuOpen ? "border-white/10 bg-white/5 text-white/80" : ""
              }`}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              title="App Menu">
              <i className="fa-solid fa-ellipsis-vertical text-[10px]" />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <div
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    className="fixed inset-0 z-80"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    className="absolute top-[22px] left-0 z-90 w-[168px] rounded-lg border border-white/10 bg-[#161c24]/90 p-1 shadow-xl backdrop-blur-md">
                    <button
                      onClick={() => {
                        setIsMenuOpen(false)
                        handleCheckUpdates()
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white">
                      <i className="fa-solid fa-cloud-arrow-up w-4 text-[11px]" />
                      Check for Updates
                    </button>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false)
                        window.location.reload()
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white">
                      <i className="fa-solid fa-rotate w-4 text-[11px]" />
                      Reload Application
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
        {(() => {
          const handleOpenCloudSync = () => {
            useUIStore.getState().setSettingsInitialSection("remote-sync")
            useUIStore.getState().setShowSettings(true)
          }

          if (!syncConfig || !syncConfig.connected) {
            return (
              <Tooltip content="Automatic sync & remote reports" position="bottom" offset={6}>
                <button
                  onClick={handleOpenCloudSync}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/50 transition-all duration-150 select-none hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90 active:scale-95">
                  <i className="fa-solid fa-cloud text-[9px] opacity-70" />
                  <span>Connect Cloud</span>
                </button>
              </Tooltip>
            )
          }

          const relativeTime = formatRelativeTime(syncConfig.lastSyncedAt)
          const pendingCount =
            (syncConfig.unsyncedRecordsCount ?? 0) + (syncConfig.unsyncedSessionsCount ?? 0)

          let badgeBorderClass =
            "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 hover:border-emerald-500/35 hover:bg-emerald-500/10"
          let dotColorClass = "bg-emerald-400"
          let statusText = pendingCount > 0 ? `Synced (${pendingCount} queued)` : "Synced"
          let tooltipContent =
            pendingCount > 0 ?
              `Last synced: ${relativeTime}. ${pendingCount} new record${pendingCount === 1 ? "" : "s"} queued. Click to open Cloud Sync.`
            : `Last synced: ${relativeTime}. All records up to date. Click to open Cloud Sync.`

          if (syncConfig.lastSyncStatus === "error") {
            badgeBorderClass =
              "border-amber-500/25 bg-amber-500/[0.06] text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10"
            dotColorClass = "bg-amber-400"
            statusText = pendingCount > 0 ? `${pendingCount} pending` : "Sync Warning"
            tooltipContent = `Sync issue: ${syncConfig.lastSyncMessage || "Network connection error."} Click to open Cloud Sync.`
          }

          return (
            <Tooltip content={tooltipContent} position="bottom" offset={6}>
              <button
                onClick={handleOpenCloudSync}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className={`pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-all duration-150 select-none active:scale-95 ${badgeBorderClass}`}>
                <span className="relative flex size-1.5">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotColorClass} opacity-60`}
                  />
                  <span className={`relative inline-flex size-1.5 rounded-full ${dotColorClass}`} />
                </span>
                <span>{statusText}</span>
              </button>
            </Tooltip>
          )
        })()}
      </div>

      <AnimatePresence>
        {updateInfo?.hasUpdate && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={
              {
                WebkitAppRegion: "no-drag",
                willChange: "transform, opacity",
              } as React.CSSProperties
            }
            className="relative z-70 mr-3 flex items-center">
            <Tooltip
              content={`v${updateInfo?.currentVersion} ➜ v${updateInfo?.latestVersion}`}
              position="bottom"
              offset={6}>
              <button
                onClick={handleOpenRelease}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className="relative flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-800/40 bg-cyan-950/50 px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-cyan-400 uppercase shadow-[0_0_12px_rgba(6,182,212,0.15)] transition-all duration-200 select-none [webkit-app-region:no-drag] hover:border-cyan-700/50 hover:bg-cyan-900/60 hover:text-cyan-300">
                Update Available
              </button>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {!isMac && (
        <div
          className={`relative z-70 flex h-full [webkit-app-region:no-drag] ${
            isLinux ? "items-center px-1" : "items-stretch"
          }`}
          style={
            {
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }>
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            title="Minimize"
            className={`group flex items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 h-[28px] w-[28px] rounded-md hover:bg-white/10"
              : "h-full w-[46px] hover:bg-white/10"
            }`}>
            <span
              className="h-full w-full bg-white/70 transition-colors group-hover:bg-white"
              style={iconStyle("minimize")}
            />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
            className={`group flex items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 h-[28px] w-[28px] rounded-md hover:bg-white/10"
              : "h-full w-[46px] hover:bg-white/10"
            }`}>
            <span
              className="h-full w-full bg-white/70 transition-colors group-hover:bg-white"
              style={iconStyle(isMaximized ? "restore-down" : "maximize")}
            />
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            title="Close"
            className={`group flex items-center justify-center border-none bg-transparent p-0 transition-all duration-150 outline-none ${
              isLinux ?
                "mx-0.5 h-[28px] w-[28px] rounded-md hover:bg-[#e81123]"
              : "h-full w-[46px] hover:bg-[#e81123]"
            }`}>
            <span
              className="h-full w-full bg-white/80 transition-colors group-hover:bg-white"
              style={iconStyle("close")}
            />
          </button>
        </div>
      )}

      <Modal
        isOpen={isUpdateModalOpen}
        onClose={updateCheckState !== "checking" ? () => setIsUpdateModalOpen(false) : undefined}
        title="App Update"
        maxWidth="sm"
        hideCloseButton={updateCheckState === "checking"}>
        {updateCheckState === "checking" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <Spinner size="md" color="cyan" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Checking for updates...</p>
              <p className="text-xs text-white/50">Connecting to the update server. Please wait.</p>
            </div>
          </div>
        )}

        {updateCheckState === "up-to-date" && (
          <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <i className="fa-solid fa-check text-xl" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">You&apos;re up to date!</p>
              <p className="text-xs text-white/50">
                Facenox v{checkedUpdateInfo?.currentVersion} is the latest version available.
              </p>
            </div>
            <button
              onClick={() => setIsUpdateModalOpen(false)}
              className="mt-2 rounded-lg bg-cyan-500 px-6 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-cyan-400 active:scale-95">
              Close
            </button>
          </div>
        )}

        {updateCheckState === "available" && (
          <div className="flex flex-col items-center justify-center gap-4 py-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <i className="fa-solid fa-cloud-arrow-down text-xl" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">New Version Available!</p>
              <p className="text-xs text-white/50">
                v{checkedUpdateInfo?.currentVersion} ➜{" "}
                <span className="font-bold text-cyan-400">v{checkedUpdateInfo?.latestVersion}</span>
              </p>
            </div>
            {checkedUpdateInfo?.releaseNotes && (
              <div className="custom-scroll max-h-32 w-full overflow-y-auto rounded-lg border border-white/5 bg-white/5 p-3 text-left font-mono text-xs text-white/60">
                {checkedUpdateInfo.releaseNotes}
              </div>
            )}
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setIsUpdateModalOpen(false)}
                className="rounded-lg border border-white/10 bg-transparent px-5 py-2 text-xs font-semibold text-white/70 transition-all hover:bg-white/5 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsUpdateModalOpen(false)
                  updaterService.openReleasePage(
                    checkedUpdateInfo?.releaseUrl || "https://facenox.com/download",
                  )
                }}
                className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-cyan-400 active:scale-95">
                Download Update
              </button>
            </div>
          </div>
        )}

        {(updateCheckState === "error" || updateCheckState === "offline") && (
          <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
              <i className="fa-solid fa-triangle-exclamation text-xl" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Update Check Failed</p>
              <p className="text-xs text-white/50">
                {updateCheckState === "offline" ?
                  "No internet connection detected."
                : "Could not reach the update server."}
              </p>
            </div>
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setIsUpdateModalOpen(false)}
                className="rounded-lg border border-white/10 bg-transparent px-5 py-2 text-xs font-semibold text-white/70 transition-all hover:bg-white/5 hover:text-white">
                Close
              </button>
              <button
                onClick={handleCheckUpdates}
                className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-cyan-400 active:scale-95">
                Try Again
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
