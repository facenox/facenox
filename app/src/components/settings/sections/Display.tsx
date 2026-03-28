import { motion, AnimatePresence } from "framer-motion"
import type { QuickSettings } from "@/components/settings/types"

interface DisplayProps {
  quickSettings: QuickSettings
  toggleQuickSetting: (key: keyof QuickSettings) => void
}

export function Display({ quickSettings, toggleQuickSetting }: DisplayProps) {
  const settingItems = [
    {
      key: "cameraMirrored" as keyof QuickSettings,
      label: "Camera Mirroring",
      descriptions: {
        on: "ON: Camera is mirrored.",
        off: "OFF: Normal camera view.",
      },
    },
    {
      key: "showRecognitionNames" as keyof QuickSettings,
      label: "Identification Labels",
      descriptions: {
        on: "ON: Member names are shown on the camera feed.",
        off: "OFF: Names are hidden.",
      },
    },
  ]

  return (
    <div className="max-w-auto space-y-4 px-10 pt-4 pb-10">
      {settingItems.map(({ key, label, descriptions }) => (
        <div key={key} className="flex items-center gap-4 border-b border-white/5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white/90">{label}</div>
            <div className="relative min-h-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${key}-${quickSettings[key]}`}
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  transition={{ duration: 0.15 }}
                  className="text-xs text-white/50">
                  {quickSettings[key] ? descriptions.on : descriptions.off}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <button
            onClick={() => toggleQuickSetting(key)}
            className={`relative ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              quickSettings[key] ? "bg-cyan-500/30" : "bg-white/10"
            }`}>
            <div
              className={`absolute left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                quickSettings[key] ? "translate-x-4.5" : "translate-x-0"
              }`}></div>
          </button>
        </div>
      ))}
    </div>
  )
}
