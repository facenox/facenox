import { motion, AnimatePresence } from "framer-motion"
import type { AudioSettings } from "@/components/settings/types"

interface NotificationsProps {
  audioSettings: AudioSettings
  onAudioSettingsChange: (updates: Partial<AudioSettings>) => void
}

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
                  transition={{ duration: 0.15 }}
                  className="text-xs text-white/50">
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
            className={`relative ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              audioSettings.recognitionSoundEnabled ? "bg-cyan-500/30" : "bg-white/10"
            }`}>
            <div
              className={`absolute left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                audioSettings.recognitionSoundEnabled ? "translate-x-4.5" : "translate-x-0"
              }`}></div>
          </button>
        </div>
      </div>
    </div>
  )
}
