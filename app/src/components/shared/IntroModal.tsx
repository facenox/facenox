import { useCallback, useEffect, useState } from "react"
import { useUIStore } from "@/components/main/stores/uiStore"
import { Modal, QRCodeView, Spinner } from "@/components/common"
import { ErrorText } from "@/components/common/ErrorText"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Cloud, ExternalLink, RotateCw, Wifi, AlertCircle } from "lucide-react"
import { useCloudSyncConfig, refreshCloudSyncConfig } from "@/services/cloudSyncState"
import { getEffectiveRemoteUrl, useCloudPairing } from "@/hooks/useCloudPairing"
import { isOfflineError } from "@/components/settings/sections/syncErrorUtils"
import {
  LOCAL_DEV_REMOTE_BASE_URL,
  OFFICIAL_REMOTE_BASE_URL,
  isOfficialCloudUrl,
} from "@/services/syncDefaults"

interface IntroModalProps {
  initialStep?: number
  allowLocalContinue?: boolean
}

/**
 * First-launch onboarding & Cloud connection gate.
 *
 * Steps 1-2: On-device biometric architecture & template privacy
 * Step 3: Mandatory Cloud sign-in / pairing for new installs (with local continuation
 *         preserved for existing beta installations that already hold local attendance data)
 */
export function IntroModal({ initialStep = 0, allowLocalContinue = false }: IntroModalProps) {
  const { setHasSeenIntro } = useUIStore()
  const {
    config: cloudConfig,
    status: cloudConfigStatus,
    error: cloudConfigError,
  } = useCloudSyncConfig()
  const [step, setStep] = useState(initialStep)
  const [isOpen, setIsOpen] = useState(true)
  const [showManualInput, setShowManualInput] = useState(false)
  const [showDevEndpoint, setShowDevEndpoint] = useState(false)
  const [devClickCount, setDevClickCount] = useState(0)
  const [customEndpoint, setCustomEndpoint] = useState("")
  const [busyAction, setBusyAction] = useState<
    "saving" | "pairing" | "disconnecting" | "syncing" | null
  >(null)
  const [pairError, setPairError] = useState<string | null>(null)

  const isDevBuild = import.meta.env.DEV

  useEffect(() => {
    if (!isDevBuild) return
    const saved = cloudConfig?.remoteBaseUrl
    if (saved && !isOfficialCloudUrl(saved)) {
      setCustomEndpoint(saved)
      setShowDevEndpoint(true)
    } else {
      setCustomEndpoint("")
    }
  }, [isDevBuild, cloudConfig?.remoteBaseUrl])

  useEffect(() => {
    if (!isDevBuild) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault()
        setShowDevEndpoint((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isDevBuild])

  const applyEndpointOverride = useCallback(async (nextUrl: string) => {
    setPairError(null)
    setBusyAction("saving")
    try {
      await window.electronAPI.sync.updateConfig({
        remoteBaseUrl: nextUrl.trim(),
      })
      await refreshCloudSyncConfig()
    } catch (err) {
      setPairError(err instanceof Error ? err.message : "Could not switch Cloud endpoint.")
    } finally {
      setBusyAction(null)
    }
  }, [])

  const completeOnboarding = useCallback(() => {
    setIsOpen(false)
    setTimeout(() => {
      setHasSeenIntro(true)
    }, 250)
  }, [setHasSeenIntro])

  const handlePairingWarningOrError = useCallback((msg: string | null) => {
    setPairError(msg)
    if (msg && msg.includes("initial sync failed")) {
      useUIStore.getState().setError(msg)
    }
  }, [])

  const {
    reversePairing,
    isInitiating,
    isInitiatingRef,
    initiateError,
    secondsLeft,
    pairingCode,
    setPairingCode,
    startReversePairing,
    handlePair,
  } = useCloudPairing({
    enabled: step === 2,
    remoteBaseUrl: isDevBuild ? cloudConfig?.remoteBaseUrl : OFFICIAL_REMOTE_BASE_URL,
    deviceName: cloudConfig?.deviceName,
    connected: Boolean(cloudConfig?.connected),
    cloudConfigStatus,
    busyAction,
    setBusyAction,
    onError: handlePairingWarningOrError,
    onConnected: completeOnboarding,
  })

  const steps = [
    {
      title: "Welcome to Facenox",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox runs face detection, tracking, liveness verification, and recognition directly{" "}
            <strong>on this computer</strong>.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            Attendance continues working even during internet disruptions. Once connected, records
            and policies sync automatically with your Facenox Cloud workspace.
          </p>
        </div>
      ),
    },
    {
      title: "Encrypted face templates",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox stores <strong>encrypted numerical face templates</strong>, never member photos.
            Biometric data cannot be reconstructed into an image.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            Designed for strict biometric data privacy compliance. The{" "}
            <a
              href="https://github.com/facenox/facenox"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-0.5 text-cyan-400/80 underline decoration-cyan-400/30 underline-offset-4 transition-colors hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:outline-none">
              source code
            </a>{" "}
            is open and verifiable.
          </p>

          <div className="border-t border-white/5 pt-2 text-center">
            <a
              href="https://github.com/facenox/facenox/blob/main/docs/PRIVACY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-0.5 text-[11px] text-white/55 underline decoration-white/10 underline-offset-2 transition-colors hover:text-white/65 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              View full privacy manual
            </a>
          </div>
        </div>
      ),
    },
    {
      title: "Connect to Facenox Cloud",
      content: (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-white/70">
            Sign in once to link this computer to your workspace. Afterward, the app works offline
            and syncs automatically whenever you&apos;re back online.
          </p>

          {isDevBuild && showDevEndpoint && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wider text-white/50 uppercase">
                  Dev endpoint
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void applyEndpointOverride(OFFICIAL_REMOTE_BASE_URL)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                      isOfficialCloudUrl(cloudConfig?.remoteBaseUrl) ? "bg-white/15 text-white" : (
                        "bg-white/5 text-white/50 hover:text-white"
                      )
                    }`}>
                    Production
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void applyEndpointOverride(LOCAL_DEV_REMOTE_BASE_URL)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                      cloudConfig?.remoteBaseUrl?.trim() === LOCAL_DEV_REMOTE_BASE_URL ?
                        "bg-white/15 text-white"
                      : "bg-white/5 text-white/50 hover:text-white"
                    }`}>
                    Localhost
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder={OFFICIAL_REMOTE_BASE_URL}
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  className="h-7 flex-1 rounded border border-white/10 bg-black/20 px-2.5 text-[11px] text-white outline-none focus:border-white/25"
                />
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void applyEndpointOverride(customEndpoint)}
                  className="h-7 rounded border border-white/10 bg-white/5 px-2.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40">
                  Apply
                </button>
              </div>
            </div>
          )}

          {cloudConfigStatus === "loading" ?
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <Spinner size="md" color="cyan" />
              <p className="text-xs text-white/60">Checking Cloud connection…</p>
            </div>
          : cloudConfigStatus === "error" ?
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <AlertCircle className="size-4" />
              </div>
              <p className="max-w-xs text-xs text-white/70">
                {cloudConfigError || "Could not load Cloud connection settings."}
              </p>
              <button
                type="button"
                onClick={() => void refreshCloudSyncConfig()}
                className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white transition hover:bg-white/10">
                <RotateCw className="size-3" />
                Retry
              </button>
            </div>
          : cloudConfig?.connected ?
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check className="size-5" />
              </div>
              <p className="text-sm font-semibold text-white">Connected to Facenox Cloud</p>
              <button
                type="button"
                onClick={completeOnboarding}
                className="mt-1 rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-6 py-2 text-xs font-bold tracking-wider text-slate-950 transition hover:from-cyan-300 hover:to-cyan-400">
                Continue
              </button>
            </div>
          : isInitiating && !reversePairing ?
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <Spinner size="md" color="cyan" />
              <p className="text-xs font-medium text-white/70">Preparing sign-in link…</p>
            </div>
          : initiateError ?
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              {isOfflineError(initiateError) ?
                <>
                  <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50">
                    <Wifi className="size-4 text-white/40" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white/90">Device is offline</p>
                    <p className="max-w-xs text-[11px] leading-relaxed text-white/50">
                      Connect to the internet once to sign in and link this computer.
                    </p>
                  </div>
                </>
              : <>
                  <div className="flex size-9 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                    <AlertCircle className="size-4" />
                  </div>
                  <div className="max-w-sm text-[11px] break-words text-white/60">
                    <ErrorText message={initiateError} />
                  </div>
                </>
              }
              <button
                type="button"
                onClick={() => {
                  isInitiatingRef.current = false
                  void startReversePairing(getEffectiveRemoteUrl(cloudConfig?.remoteBaseUrl))
                }}
                className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white transition hover:bg-white/10">
                <RotateCw className="size-3" />
                Retry connection
              </button>
            </div>
          : reversePairing ?
            <div className="flex flex-col items-center space-y-5 pt-2 text-center">
              <a
                href={reversePairing.verificationUriComplete || reversePairing.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-5 py-2.5 text-xs font-bold tracking-wide text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all hover:from-cyan-300 hover:to-cyan-400 active:scale-[0.98]">
                <Cloud className="size-3.5" />
                <span>Sign in with Facenox Cloud</span>
                <ExternalLink className="size-3" />
              </a>

              <div className="flex items-center gap-4">
                <QRCodeView value={reversePairing.verificationUriComplete} size={96} />
                <div className="space-y-1.5 text-left">
                  <p className="text-[11px] text-white/55">Or scan QR &amp; verify code:</p>
                  <div className="inline-flex items-center gap-2 rounded-md bg-white/[0.05] px-3 py-1.5 font-mono text-lg font-bold tracking-[0.2em] text-white select-all">
                    <span>{reversePairing.userCode.slice(0, 3)}</span>
                    <span>{reversePairing.userCode.slice(3, 6)}</span>
                  </div>
                  <p className="text-[11px] text-white/40">
                    Waiting for authorization (
                    <span className="font-mono">
                      {Math.floor(secondsLeft / 60)}:
                      {(secondsLeft % 60).toString().padStart(2, "0")}
                    </span>
                    )
                  </p>
                </div>
              </div>
            </div>
          : null}

          {cloudConfigStatus === "ready" && !cloudConfig?.connected && (
            <div className="flex flex-col items-center pt-1 text-center">
              {!showManualInput ?
                <button
                  type="button"
                  onClick={() => setShowManualInput(true)}
                  className="text-[11px] text-white/40 transition-colors hover:text-white/75">
                  Have a pairing code already? Enter it here →
                </button>
              : <div className="w-full space-y-2 pt-1 text-left">
                  <label className="block text-[11px] font-medium text-white/55">
                    Enter 8-character code from Cloud Dashboard → Devices
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="ABCD2345"
                      value={pairingCode}
                      onChange={(e) => {
                        setPairError(null)
                        setPairingCode(e.target.value.toUpperCase())
                      }}
                      className="h-8 flex-1 rounded border border-white/10 bg-transparent px-3 font-mono text-xs font-semibold tracking-widest text-white uppercase outline-none focus:border-white/25"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void handlePair()}
                      disabled={busyAction !== null || !pairingCode}
                      className="flex h-8 items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40">
                      {busyAction === "pairing" && <Spinner size="xs" color="white" />}
                      Connect
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualInput(false)
                        setPairingCode("")
                        setPairError(null)
                      }}
                      className="px-1.5 text-xs text-white/40 transition hover:text-white/75">
                      Cancel
                    </button>
                  </div>
                  {pairError && <p className="text-left text-[11px] text-rose-400">{pairError}</p>}
                </div>
              }
            </div>
          )}
        </div>
      ),
    },
  ]

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const currentStep = steps[step]
  const isLastStep = step === steps.length - 1

  return (
    <Modal isOpen={isOpen} maxWidth="max-w-[540px]" hideCloseButton={true}>
      <div className="relative -m-5 overflow-hidden bg-[var(--bg-secondary)]">
        <div className="p-8 sm:p-10">
          <div className="mb-5 flex items-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-cyan-400" : "w-1.5 bg-white/15"
                }`}
              />
            ))}
          </div>

          <div className="mb-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ willChange: "opacity, transform" }}>
                <h2
                  onClick={() => {
                    if (!isDevBuild || step !== 2) return
                    const next = devClickCount + 1
                    if (next >= 5) {
                      setDevClickCount(0)
                      setShowDevEndpoint((prev) => !prev)
                    } else {
                      setDevClickCount(next)
                    }
                  }}
                  className="mb-4 text-2xl font-bold tracking-tight text-white select-none">
                  {currentStep.title}
                </h2>
                <div className="flex min-h-[140px] flex-col justify-center">
                  {currentStep.content}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className={`rounded-lg border-none! bg-transparent! px-0 py-1.5 text-xs font-medium shadow-none! transition-all focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none ${
                step === 0 ? "pointer-events-none opacity-0" : "text-white/55 hover:text-white"
              }`}>
              Back
            </button>

            {isLastStep ?
              allowLocalContinue && (
                <button
                  type="button"
                  onClick={completeOnboarding}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-white/55 transition-colors hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
                  Continue with local data
                </button>
              )
            : <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-7 py-2 text-xs font-bold tracking-wider text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                Next
              </button>
            }
          </div>
        </div>
      </div>
    </Modal>
  )
}
