import { motion, AnimatePresence } from "framer-motion"
import type { AudioSettings } from "@/components/settings/types"

interface NotificationsProps {
  audioSettings: AudioSettings
  onAudioSettingsChange: (updates: Partial<AudioSettings>) => void
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14

export function Notifications({ audioSettings, onAudioSettingsChange }: NotificationsProps) {
  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4 px-10 pt-4 pb-10">
      <div className="space-y-4">
        {/* Recognition sound */}
        <div className="flex items-center gap-4 border-b border-white/5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white/90">Scan Confirmation Sound</div>
            <div className="relative min-h-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={audioSettings.recognitionSoundEnabled ? "on" : "off"}
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                  className="text-xs font-medium text-white/60">
                  {audioSettings.recognitionSoundEnabled ?
                    "ON: Play a notification sound when someone scans."
                  : "OFF: Silent mode enabled."}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <button
            onClick={() =>
              onAudioSettingsChange({
                recognitionSoundEnabled: !audioSettings.recognitionSoundEnabled,
              })
            }
            className={`premium-switch ${audioSettings.recognitionSoundEnabled ? "premium-switch-on" : "premium-switch-off"}`}>
            <div
              className={`premium-switch-thumb ${audioSettings.recognitionSoundEnabled ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
          </button>
        </div>
      </div>
    </div>
  )
}
