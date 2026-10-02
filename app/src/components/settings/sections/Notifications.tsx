import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { AudioSettings } from "@/components/settings/types"
import { Switch, Dropdown, Tooltip } from "@/components/shared"
import { soundEffects } from "@/services/SoundEffectsService"

interface NotificationsProps {
  audioSettings: AudioSettings
  onAudioSettingsChange: (updates: Partial<AudioSettings>) => void
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

export function Notifications({ audioSettings, onAudioSettingsChange }: NotificationsProps) {
  const [sounds, setSounds] = useState<Array<{ fileName: string; url: string }>>(DEFAULT_SOUNDS)
  const [isPlaying, setIsPlaying] = useState(false)

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
    return audioSettings.recognitionSoundUrl || sounds[0]?.url || DEFAULT_SOUNDS[0].url
  }, [audioSettings.recognitionSoundUrl, sounds])

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
        icon: <i className="fa-solid fa-music text-white/50" />,
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

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4 px-10 pt-8 pb-10">
      <div className="flex flex-col border-b border-white/5 pb-4">
        {/* Audio feedback toggle */}
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
                    "Play a sound on successful recognition."
                  : "Mute all recognition sounds."}
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

        {/* Tone Selector & Preview (Nested Subsetting) */}
        <AnimatePresence>
          {audioSettings.recognitionSoundEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: SETTINGS_ROW_ANIMATION_DURATION, ease: "easeInOut" }}
              className="overflow-hidden">
              <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
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
                        className={`fa-solid ${isPlaying ? "fa-volume-high text-cyan-400" : "fa-play text-xs"} transition-colors`}
                      />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
