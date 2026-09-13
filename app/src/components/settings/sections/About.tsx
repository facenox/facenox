import { useState, useEffect, useCallback, useRef } from "react"
import { updaterService } from "@/services"
import type { UpdateInfo } from "@/types/updater"
import { Modal, Spinner } from "@/components/common"

interface PrivacyModalProps {
  isOpen: boolean
  onClose: () => void
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[520px]"
      title="Privacy & Data Handling">
      <div className="space-y-5 pt-2">
        <p className="text-[12px] leading-relaxed text-white/65">
          Facenox is built with a privacy-first architecture, ensuring full compliance and local
          control over your biometric data:
        </p>

        <div className="custom-scroll max-h-[50vh] space-y-5 overflow-y-auto pr-1 text-xs">
          {/* Section 1 */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">Data remains local</div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Biometric templates, attendance records, and app settings are stored locally on this
              machine. Face matching and liveness detection execute entirely on-device, independent
              of any cloud-based biometric matching engines.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">
              Zero telemetry and tracking
            </div>
            <p className="text-[11px] leading-relaxed text-white/50">
              The application runs without ads, telemetry scripts, or usage tracking. No diagnostic
              or performance data is transmitted externally, keeping your network interface
              completely private.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">
              Offline operational capability
            </div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Face matching and liveness verification run without active network connectivity. This
              allows secure, offline deployments and ensures system availability during internet
              outages.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">Cloud sync data boundary</div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Connecting to Facenox Cloud synchronizes employee metadata, attendance logs, and
              encrypted biometric vectors (embeddings) to enable multi-device sync and automatic
              backup. Raw camera frames are processed locally and are never persisted to disk or
              uploaded.
            </p>
          </div>

          {/* Section 5 */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">
              Compliance tools & disclaimers
            </div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Facenox provides consent logging, data export, and secure purge controls to assist
              with privacy regulations. Note that compliance ultimately depends on your
              organization&apos;s operational policies and notices.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updaterService.openReleasePage("https://gdpr-info.eu/")}
              className="rounded bg-white/5 px-2.5 py-1 text-[9px] font-semibold text-white/55 transition-all hover:bg-white/10 hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-95">
              GDPR (EU)
            </button>
            <button
              onClick={() =>
                updaterService.openReleasePage("https://privacy.gov.ph/data-privacy-act/")
              }
              className="rounded bg-white/5 px-2.5 py-1 text-[9px] font-semibold text-white/55 transition-all hover:bg-white/10 hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-95">
              Data Privacy Act (PH)
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface UpdateStatusProps {
  updateInfo: UpdateInfo | null
  isChecking: boolean
  showSuccess: boolean
  lastChecked: Date | null
  onCheck: () => void
  onDownload: () => void
}

const UpdateStatus: React.FC<UpdateStatusProps> = ({
  updateInfo,
  isChecking,
  showSuccess,
  lastChecked,
  onCheck,
  onDownload,
}) => {
  const formatLastChecked = (date: Date) => {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (updateInfo?.isOffline) {
    return <span className="text-xs text-amber-400/70">No internet</span>
  }

  if (updateInfo?.hasUpdate) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-cyan-400">
            Update available (v{updateInfo.latestVersion})
          </span>
          <button
            onClick={onDownload}
            className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 transition-all hover:bg-cyan-500/20 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95">
            Download
          </button>
        </div>
        {lastChecked && (
          <span className="text-[10px] whitespace-nowrap text-white/20">
            Last checked: {formatLastChecked(lastChecked)}
          </span>
        )}
      </div>
    )
  }

  if (updateInfo?.error) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs whitespace-nowrap text-red-400/50">Update check failed</span>
          <button
            onClick={onCheck}
            disabled={isChecking}
            className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-1.5 text-xs font-medium text-white/65 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        {showSuccess && <span className="text-xs font-medium text-emerald-400">Up to date</span>}
        <button
          onClick={onCheck}
          disabled={isChecking}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
            isChecking ?
              "border-white/10 bg-[rgba(22,28,36,0.68)] text-white/55"
            : "border-transparent bg-transparent text-white/65 hover:border-white/10 hover:bg-[rgba(22,28,36,0.62)] hover:text-white"
          } disabled:opacity-50`}>
          {isChecking ?
            <div className="flex items-center gap-2">
              <Spinner size="xs" color="white" className="opacity-60" />
              <span>Checking...</span>
            </div>
          : "Check for updates"}
        </button>
      </div>
      {lastChecked && !isChecking && (
        <span className="text-[10px] whitespace-nowrap text-white/20">
          Last checked: {formatLastChecked(lastChecked)}
        </span>
      )}
    </div>
  )
}

export const About: React.FC = () => {
  const [version, setVersion] = useState<string>("")
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleExportHealth = useCallback(async () => {
    setIsExporting(true)
    try {
      await window.facenoxElectron?.exportHealth()
    } catch (error) {
      console.error("Export health failed:", error)
    } finally {
      setIsExporting(false)
    }
  }, [])

  useEffect(() => {
    updaterService.getVersion().then(setVersion)

    const init = async () => {
      await updaterService.waitForInitialization()
      const cached = updaterService.getCachedUpdateInfo()
      if (cached) setUpdateInfo(cached)

      const last = updaterService.getLastChecked()
      if (last) setLastChecked(last)
    }

    init()

    const unsubscribe = updaterService.onUpdateInfoChanged((info) => {
      setUpdateInfo(info)
      const last = updaterService.getLastChecked()
      if (last) setLastChecked(last)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    setIsChecking(true)
    setShowSuccess(false)
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    try {
      const info = await updaterService.checkForUpdates(true)
      setUpdateInfo(info)
      setLastChecked(new Date())

      // Show success state if no update found
      if (!info.hasUpdate) {
        setShowSuccess(true)
        successTimerRef.current = setTimeout(() => {
          setShowSuccess(false)
          successTimerRef.current = null
        }, 5000)
      }
    } finally {
      setIsChecking(false)
    }
  }, [])

  // Cleanup the success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const handleDownload = useCallback(() => {
    updaterService.openReleasePage("https://facenox.com/download")
  }, [])

  const openLink = (url: string) => () => updaterService.openReleasePage(url)

  return (
    <div className="relative min-h-full w-full">
      <PrivacyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />

      <div className="mx-auto flex min-h-full max-w-lg flex-col items-center px-10 pt-8 pb-10 text-center">
        <div className="w-full flex-1 space-y-9">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-22 w-22 items-center justify-center">
              <img
                src="./icons/logo-transparent.png"
                alt="Facenox logo"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Facenox</h1>
            <div className="flex min-h-7 items-center justify-center px-2.5 py-0.5">
              <span className="font-mono text-[11px] leading-none tracking-[0.02em] text-white/55">
                {version || "-"}
              </span>
            </div>
          </div>

          <div className="w-full space-y-1 text-left">
            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/55">Updates</span>
              <UpdateStatus
                updateInfo={updateInfo}
                isChecking={isChecking}
                showSuccess={showSuccess}
                lastChecked={lastChecked}
                onCheck={handleCheckForUpdates}
                onDownload={handleDownload}
              />
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/55">License</span>
              <button
                onClick={openLink("https://www.gnu.org/licenses/agpl-3.0.html")}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/55 transition-all hover:border-white/10 hover:bg-[rgba(22,28,36,0.62)] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95">
                View GNU AGPL v3
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/55">Source code</span>
              <button
                onClick={openLink("https://github.com/facenox/facenox")}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/55 transition-all hover:border-white/10 hover:bg-[rgba(22,28,36,0.62)] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95">
                View Repository
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/55">Privacy & Data</span>
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/65 transition-all hover:border-cyan-500/10 hover:bg-cyan-500/10 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95">
                Read Policy
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-medium text-white/55">Diagnostics</span>
                <span className="mt-0.5 text-[9px] text-white/55">System health & error logs</span>
              </div>
              <button
                disabled={isExporting}
                onClick={handleExportHealth}
                className="group flex items-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/65 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95 disabled:opacity-50">
                {isExporting ?
                  <>
                    <Spinner size="xs" color="white" className="opacity-60" />
                    <span>Exporting...</span>
                  </>
                : <span>Export Health Data</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-auto w-full border-t border-white/5 pt-10 pb-4">
          <div className="mb-5 flex items-center justify-center gap-6">
            <button
              onClick={openLink("https://github.com/facenox/facenox/releases")}
              className="w-20 rounded px-1 text-center text-[11px] font-semibold text-white/65 transition-colors hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              Releases
            </button>
            <button
              onClick={openLink("https://github.com/facenox/facenox/issues")}
              className="w-20 rounded px-1 text-center text-[11px] font-semibold text-white/65 transition-colors hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              Support
            </button>
            <button
              onClick={openLink("https://github.com/facenox/facenox#readme")}
              className="w-20 rounded px-1 text-center text-[11px] font-semibold text-white/65 transition-colors hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              Docs
            </button>
          </div>
          <p className="text-[11px] font-medium text-white/55">© 2026 Facenox</p>
        </div>
      </div>
    </div>
  )
}
