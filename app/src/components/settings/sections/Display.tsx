import { motion, AnimatePresence } from "framer-motion"
import type { QuickSettings } from "@/components/settings/types"

interface DisplayProps {
  quickSettings: QuickSettings
  toggleQuickSetting: (key: keyof QuickSettings) => void
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14

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
    <div className="mx-auto w-full max-w-[900px] space-y-4 px-10 pt-4 pb-10">
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
                  transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                  className="text-xs font-medium text-white/60">
                  {quickSettings[key] ? descriptions.on : descriptions.off}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <button
            onClick={() => toggleQuickSetting(key)}
            className={`premium-switch ${quickSettings[key] ? "premium-switch-on" : "premium-switch-off"}`}>
            <div
              className={`premium-switch-thumb ${quickSettings[key] ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
          </button>
        </div>
      ))}
    </div>
  )
}
