import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { QuickSettings, AudioSettings } from "@/components/settings/types"
import { Switch, Dropdown, Tooltip } from "@/components/shared"
import { soundEffects } from "@/services/SoundEffectsService"

interface DisplayProps {
  quickSettings: QuickSettings
  toggleQuickSetting: (key: keyof QuickSettings) => void
  audioSettings?: AudioSettings
  onAudioSettingsChange?: (updates: Partial<AudioSettings>) => void
  streamRef?: React.RefObject<MediaStream | null>
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14
const SETTINGS_ROW_ANIMATION_DURATION = 0.18

const DEFAULT_SOUNDS = [
  {
    fileName: "Recognition_Success.wav",
    url: "./assets/sounds/Recognition_Success.wav",
  },
]

function formatSoundName(fileName: string): string {
  if (!fileName) return "Default"
  const withoutExt = fileName.replace(/\.[^/.]+$/, "")
  const formatted = withoutExt.replace(/[_-]+/g, " ").trim()
  if (
    !formatted ||
    formatted.toLowerCase() === "recognition success" ||
    formatted.toLowerCase() === "default"
  ) {
    return "Default"
  }
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function Display({
  quickSettings,
  toggleQuickSetting,
  audioSettings,
  onAudioSettingsChange,
  streamRef,
}: DisplayProps) {
  const previewVideoRef = useRef<HTMLVideoElement>(null)

  // Audio feedback state
  const [sounds, setSounds] = useState<Array<{ fileName: string; url: string }>>(DEFAULT_SOUNDS)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasActiveStream, setHasActiveStream] = useState(false)

  // Connect active MediaStream if present
  useEffect(() => {
    const video = previewVideoRef.current
    if (!video) return

    if (streamRef?.current) {
      video.srcObject = streamRef.current
      setHasActiveStream(true)
      video.play().catch(() => {})
    } else {
      video.srcObject = null
      setHasActiveStream(false)
    }
  }, [streamRef])

  // Load available sound files
  useEffect(() => {
    let isMounted = true
    if (window.electronAPI?.assets?.listRecognitionSounds) {
      window.electronAPI.assets
        .listRecognitionSounds()
        .then((list) => {
          if (isMounted && list && list.length > 0) {
            setSounds(list)
          }
        })
        .catch((err) => {
          console.error("Failed to load recognition sounds:", err)
        })
    }
    return () => {
      isMounted = false
    }
  }, [])

  const currentSoundUrl = useMemo(() => {
    return audioSettings?.recognitionSoundUrl || sounds[0]?.url || DEFAULT_SOUNDS[0].url
  }, [audioSettings?.recognitionSoundUrl, sounds])

  useEffect(() => {
    if (currentSoundUrl) {
      soundEffects.preload(currentSoundUrl)
    }
  }, [currentSoundUrl])

  const handlePlayTest = useCallback(
    async (urlToPlay?: string) => {
      const targetUrl = urlToPlay || currentSoundUrl
      if (!targetUrl || isPlaying) return

      setIsPlaying(true)
      try {
        await soundEffects.play(targetUrl)
      } finally {
        setTimeout(() => {
          setIsPlaying(false)
        }, 650)
      }
    },
    [currentSoundUrl, isPlaying],
  )

  const soundOptions = useMemo(() => {
    const seen = new Set<string>()
    const list = sounds
      .map((s) => ({
        value: s.url,
        label: formatSoundName(s.fileName),
      }))
      .filter((item) => {
        if (seen.has(item.label)) return false
        seen.add(item.label)
        return true
      })

    return list.sort((a, b) => {
      if (a.label === "Default") return -1
      if (b.label === "Default") return 1
      return a.label.localeCompare(b.label)
    })
  }, [sounds])

  const isSettingActive = (key: keyof QuickSettings) => {
    if (key === "showTrackingBoxes") return quickSettings.showTrackingBoxes !== false
    if (key === "showDetectionPanel") return quickSettings.showDetectionPanel !== false
    if (key === "cameraFitCover") return Boolean(quickSettings.cameraFitCover)
    return Boolean(quickSettings[key])
  }

  const cameraSettingItems = [
    {
      key: "cameraMirrored" as keyof QuickSettings,
      label: "Mirror View",
      descriptions: {
        on: "Flip camera feed horizontally.",
        off: "Show standard camera orientation.",
      },
    },
    {
      key: "showRecognitionNames" as keyof QuickSettings,
      label: "Show Names",
      descriptions: {
        on: "Display recognized member names on camera overlay.",
        off: "Hide names to show tracking boxes only.",
      },
    },
    {
      key: "showTrackingBoxes" as keyof QuickSettings,
      label: "Show Tracking Boxes",
      descriptions: {
        on: "Display tracking reticles around detected faces.",
        off: "Hide tracking boxes for a clean camera display.",
      },
    },
    {
      key: "cameraFitCover" as keyof QuickSettings,
      label: "Fill Viewport",
      descriptions: {
        on: "Expand camera feed to fill screen edge-to-edge.",
        off: "Fit entire camera frame with standard letterbox.",
      },
    },
    {
      key: "showDetectionPanel" as keyof QuickSettings,
      label: "Real-Time Results",
      descriptions: {
        on: "Show real-time scanning results at the bottom of the sidebar.",
        off: "Hide live results to give attendance records full height.",
      },
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      {/* Viewport Preview */}
      <div className="flex justify-center pb-2">
        <div className="relative flex aspect-video w-full max-w-[400px] overflow-hidden rounded-xl border border-white/10 bg-black">
          {/* Camera feed */}
          <div className="relative flex h-full flex-1 items-center justify-center overflow-hidden">
            {hasActiveStream ?
              <video
                ref={previewVideoRef}
                playsInline
                muted
                autoPlay
                aria-label="Viewport preview"
                className={`h-full w-full transition-all duration-300 ${
                  quickSettings.cameraFitCover ? "object-cover" : "object-contain"
                } ${quickSettings.cameraMirrored ? "scale-x-[-1]" : ""}`}
              />
            : <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
                <div
                  className={`relative flex items-center justify-center bg-[#0d131f] transition-all duration-300 ${
                    quickSettings.cameraFitCover ? "h-full w-full scale-105" : (
                      "h-full w-[78%] scale-100"
                    )
                  }`}>
                  <div
                    className={`relative flex h-full w-full items-center justify-center pt-2 transition-transform duration-300 ${
                      quickSettings.cameraMirrored ? "scale-x-[-1]" : ""
                    }`}>
                    <svg
                      viewBox="0 0 100 100"
                      className="h-28 w-28 text-white/20 select-none"
                      fill="currentColor">
                      <circle cx="50" cy="38" r="16" fill="rgba(255,255,255,0.06)" />
                      <path
                        d="M 34 36 C 35 23, 50 20, 66 28 C 60 22, 43 21, 34 36 Z"
                        fill="rgba(255,255,255,0.22)"
                      />
                      <circle
                        cx="50"
                        cy="38"
                        r="16"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M 18 86 C 18 64, 34 58, 44 58 L 56 58 C 66 58, 82 64, 82 86 Z"
                        fill="rgba(255,255,255,0.06)"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M 44 58 L 50 68 L 56 58"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            }

            {/* Overlays */}
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
                quickSettings.cameraMirrored ? "scale-x-[-1]" : ""
              }`}>
              <div
                className={`relative flex -translate-y-3.5 items-center justify-center transition-all duration-300 ${
                  quickSettings.cameraFitCover ? "h-15 w-13" : "h-14 w-12"
                }`}>
                <AnimatePresence>
                  {quickSettings.showTrackingBoxes !== false && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 rounded-lg border-2 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {quickSettings.showRecognitionNames !== false && (
                    <motion.span
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: 0.12 }}
                      className={`pointer-events-none absolute -top-5.5 text-[11px] font-bold whitespace-nowrap text-cyan-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] select-none ${
                        quickSettings.cameraMirrored ? "scale-x-[-1]" : ""
                      }`}>
                      John Doe
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Sidebar preview */}
          <div className="flex h-full w-[100px] shrink-0 flex-col border-l border-white/10 bg-[rgba(15,19,25,0.92)] select-none">
            {/* Attendance list */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 transition-all duration-200">
              <div className="mb-2.5 flex h-4.5 items-center justify-between rounded border border-white/[0.08] bg-white/[0.02] px-1.5">
                <div className="h-1 w-11 rounded-full bg-white/40" />
                <span className="text-[6px] text-white/30">▼</span>
              </div>

              <div className="flex flex-col gap-1.5 overflow-hidden">
                <div className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-white/[0.04]">
                  <div className="h-1.5 w-10 rounded-full bg-white/70" />
                  <div className="h-2 w-6 rounded bg-white/10" />
                </div>
                <div className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-white/[0.04]">
                  <div className="h-1.5 w-8 rounded-full bg-white/40" />
                  <div className="h-2 w-6 rounded bg-white/10" />
                </div>
              </div>
            </div>

            {/* Real-time detection result (50/50 vertical split when active) */}
            <AnimatePresence initial={false}>
              {quickSettings.showDetectionPanel !== false && (
                <motion.div
                  initial={{ opacity: 0, flex: "0 0 0px" }}
                  animate={{ opacity: 1, flex: "1 1 0%" }}
                  exit={{ opacity: 0, flex: "0 0 0px" }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="flex min-h-0 flex-col overflow-hidden border-t border-white/10 bg-[rgba(10,13,18,0.96)] p-2">
                  <div className="flex items-center justify-between rounded-lg bg-cyan-500/10 px-2 py-1.5">
                    <div className="h-1.5 w-11 rounded-full bg-white/70" />
                    <i className="fa-solid fa-check text-[8px] text-cyan-400" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Camera settings */}
        {cameraSettingItems.map(({ key, label, descriptions }) => {
          const active = isSettingActive(key)
          return (
            <div key={key} className="flex items-center gap-4 border-b border-white/5 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">{label}</div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${key}-${active}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-medium text-white/65">
                      {active ? descriptions.on : descriptions.off}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch checked={active} onChange={() => toggleQuickSetting(key)} ariaLabel={label} />
            </div>
          )
        })}

        {/* Audio feedback */}
        {audioSettings && onAudioSettingsChange && (
          <div className="flex flex-col border-b border-white/5 pb-2">
            <div className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">Audio Feedback</div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={audioSettings.recognitionSoundEnabled ? "on" : "off"}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-medium text-white/65">
                      {audioSettings.recognitionSoundEnabled ?
                        "Play sound chime on successful face recognition."
                      : "Mute all face recognition sound chimes."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={audioSettings.recognitionSoundEnabled}
                onChange={(checked) =>
                  onAudioSettingsChange({
                    recognitionSoundEnabled: checked,
                  })
                }
                ariaLabel="Audio Feedback"
              />
            </div>

            {/* Tone selector */}
            <AnimatePresence>
              {audioSettings.recognitionSoundEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: SETTINGS_ROW_ANIMATION_DURATION, ease: "easeInOut" }}
                  className="overflow-hidden">
                  <div className="relative flex items-center gap-4 pt-2 pb-2 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10" />
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10" />

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-normal text-white/65">Tone:</div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <div className="w-[180px]">
                        <Dropdown
                          options={soundOptions}
                          value={currentSoundUrl}
                          onChange={(value) => {
                            if (value) {
                              const newUrl = String(value)
                              onAudioSettingsChange({
                                recognitionSoundUrl: newUrl,
                              })
                              handlePlayTest(newUrl)
                            }
                          }}
                          placeholder="Select tone..."
                          emptyMessage="No sounds available"
                          showPlaceholderOption={false}
                          allowClear={false}
                        />
                      </div>

                      <Tooltip content={isPlaying ? "Playing..." : "Test sound"}>
                        <button
                          type="button"
                          onClick={() => handlePlayTest()}
                          disabled={isPlaying || sounds.length === 0}
                          aria-label="Test recognition sound"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/5 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-30">
                          <i
                            className={`fa-solid ${
                              isPlaying ? "fa-volume-high text-cyan-400" : "fa-play text-xs"
                            } transition-colors`}
                          />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
