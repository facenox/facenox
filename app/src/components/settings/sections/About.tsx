import { useState, useEffect, useCallback, useRef } from "react"
import { updaterService } from "@/services"
import type { UpdateInfo } from "@/types/global"
import { Modal } from "@/components/common"

interface PrivacyModalProps {
  onClose: () => void
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div>
          <h2 className="text-xl font-semibold text-white">Privacy & Data Handling</h2>
          <p className="mt-1 text-sm font-normal text-white/50">
            How your information is stored and used
          </p>
        </div>
      }
      maxWidth="md">
      <div className="custom-scroll mt-2 -mr-2 max-h-[70vh] space-y-6 overflow-y-auto pr-2">
        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Your data stays local</h3>
          <p className="text-xs leading-relaxed text-white/50">
            Suri currently stores face templates, attendance records, and settings locally on your
            device by default. The current desktop app does not depend on a hosted biometric service
            to perform face recognition.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">No data collection</h3>
          <p className="text-xs leading-relaxed text-white/50">
            The current desktop app does not include analytics, ads, or hidden telemetry. Biometric
            processing is performed locally, and the app does not send routine usage data to a
            hosted monitoring service.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Works offline</h3>
          <p className="text-xs leading-relaxed text-white/50">
            Face detection, recognition, and attendance recording work without internet. This
            ensures privacy and allows use in environments with limited or no network access.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Optional cloud sync</h3>
          <p className="text-xs leading-relaxed text-white/50">
            Suri can pair with a separate Suri Cloud deployment for reporting and device sync. Face
            matching, biometric templates, and raw face images still stay local to the desktop app.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-white">Regulatory compliance</h3>
          <p className="text-xs leading-relaxed text-white/50">
            Suri includes local storage, consent tracking, export, and deletion controls that can
            help support privacy-conscious deployments. Compliance still depends on your operational
            policies and legal notices.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 pb-2">
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
              GDPR (EU)
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
              Data Privacy Act of 2012 (PH)
            </span>
          </div>
        </section>
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2 text-[11px] font-bold tracking-wider text-white/50 transition-colors hover:bg-white/10 hover:text-white">
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
            className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95">
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
            className="rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        {showSuccess && <span className="text-xs font-medium text-cyan-500/60">Up to date</span>}
        <button
          onClick={onCheck}
          disabled={isChecking}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
            isChecking ?
              "border-white/5 bg-white/5 text-white/30"
            : "border-transparent bg-transparent text-white/50 hover:border-white/10 hover:bg-white/5 hover:text-white"
          } disabled:opacity-50`}>
          {isChecking ?
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-spinner animate-spin text-[10px]" />
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
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    updaterService.openReleasePage(updateInfo?.releaseUrl)
  }, [updateInfo])

  const openLink = (url: string) => () => updaterService.openReleasePage(url)

  return (
    <div className="custom-scroll relative h-full overflow-y-auto">
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}

      <div className="mx-auto flex h-full max-w-lg flex-col items-center px-10 pt-4 pb-10 text-center">
        <div className="w-full flex-1 space-y-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white">Suri</h1>
            <p className="text-[11px] font-medium text-white/40">AI Attendance Tracker</p>
          </div>

          <div className="w-full space-y-1 text-left">
            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/30">Version</span>
              <div className="flex items-center justify-center px-3 py-1.5">
                <span className="font-mono text-xs text-white/60">{version || "-"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/30">Updates</span>
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
              <span className="text-[11px] font-medium text-white/30">License</span>
              <button
                onClick={openLink("https://www.gnu.org/licenses/agpl-3.0.html")}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/40 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white/90 active:scale-95">
                View GNU AGPL v3
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/30">Source code</span>
              <button
                onClick={openLink("https://github.com/suriAI/suri")}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/40 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white/90 active:scale-95">
                View Repository
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 py-3">
              <span className="text-[11px] font-medium text-white/30">Privacy & Data</span>
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-white/50 transition-all hover:border-cyan-500/10 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-95">
                Read Policy
              </button>
            </div>
          </div>
        </div>

        <div className="mt-auto w-full border-t border-white/5 pt-12 pb-4">
          <div className="mb-6 flex items-center justify-center gap-6">
            <button
              onClick={openLink("https://github.com/suriAI/suri/releases")}
              className="text-[11px] font-semibold text-white/35 transition-colors hover:text-white/80">
              Releases
            </button>
            <button
              onClick={openLink("https://github.com/suriAI/suri/issues")}
              className="text-[11px] font-semibold text-white/35 transition-colors hover:text-white/80">
              Support
            </button>
            <button
              onClick={openLink("https://github.com/suriAI/suri#readme")}
              className="text-[11px] font-semibold text-white/35 transition-colors hover:text-white/80">
              Docs
            </button>
          </div>
          <p className="text-[11px] font-medium text-white/25">(c) 2026 Suri</p>
        </div>
      </div>
    </div>
  )
}
