import { useState } from "react"
import { useUIStore } from "@/components/main/stores/uiStore"
import { Modal } from "@/components/common"
import { motion, AnimatePresence } from "framer-motion"

/**
 * First-launch intro flow that educates users about privacy and then
 * presents them with a choice between offline-only usage and cloud
 * dashboard connectivity.
 *
 * Steps 1–4: Privacy education (existing)
 * Step 5: "How would you like to use Facenox?" — offline vs cloud choice
 *
 * The cloud choice is presented AFTER privacy context so the user can make
 * an informed decision about data sharing. Both options are equally weighted.
 */
export function IntroModal() {
  const { setHasSeenIntro, setPendingCloudSetup } = useUIStore()
  const [step, setStep] = useState(0)
  const [isOpen, setIsOpen] = useState(true)
  const [hoveredCard, setHoveredCard] = useState<"offline" | "cloud" | null>(null)
  const [selectedPath, setSelectedPath] = useState<"offline" | "cloud">("offline")

  const steps = [
    {
      title: "Welcome to Facenox",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox is an <strong>offline-first, privacy-focused</strong> face recognition system
            designed for real-time attendance tracking. Everything is processed directly on this
            device to keep your information secure and under local control.
          </p>
          <p className="text-xs text-white/65">
            Here is a quick overview of how information is protected.
          </p>
        </div>
      ),
    },
    {
      title: "No Photos Stored",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox <strong>never saves actual photos</strong> of people. Instead, it creates a
            secure face template.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            This template is encrypted and cannot be turned back into a photo, keeping
            everyone&apos;s biometric identity private and safe from data breaches.
          </p>
        </div>
      ),
    },
    {
      title: "It stays on this computer",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            All face detection, tracking, liveness verification, and recognition are processed{" "}
            <strong>entirely on this device</strong>.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            Your biometric face template never leaves this machine unencrypted. Basic profile info
            (like names) and attendance logs are also shared if you choose to sync with the cloud.
          </p>
        </div>
      ),
    },
    {
      title: "Privacy & Security",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox aligns with global privacy standards, ensuring your biometric information is
            protected.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            Our codebase is fully{" "}
            <a
              href="https://github.com/facenox/facenox"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-0.5 text-cyan-400/80 underline decoration-cyan-400/30 underline-offset-4 transition-colors hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:outline-none">
              open-source
            </a>
            , offering complete transparency into how we manage and secure local assets.
          </p>

          <div className="border-t border-white/5 pt-2 text-center">
            <a
              href="https://github.com/facenox/facenox/blob/main/docs/PRIVACY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-0.5 text-[11px] text-white/55 underline decoration-white/10 underline-offset-2 transition-colors hover:text-white/65 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
              View Full Privacy Manual
            </a>
          </div>

          <p className="pt-1 text-center text-[11px] text-white/55 italic">
            By proceeding, you acknowledge the on-device management of your personal information.
          </p>
        </div>
      ),
    },
    {
      title: "How would you like to use Facenox?",
      isChoiceStep: true,
      content: (
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-white/55">
            Choose how this device operates. You can always change this later in{" "}
            <span className="font-medium text-white/70">Settings → Cloud Sync</span>.
          </p>
        </div>
      ),
    },
  ]

  /** Completes the intro and optionally sets the cloud setup flag. */
  const handleFinish = (choice: "offline" | "cloud") => {
    if (choice === "cloud") {
      setPendingCloudSetup(true)
    }
    setIsOpen(false)
    setTimeout(() => {
      setHasSeenIntro(true)
    }, 250)
  }

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      handleFinish(selectedPath)
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
    <Modal isOpen={isOpen} maxWidth={isLastStep ? "max-w-[620px]" : "md"} hideCloseButton={true}>
      <div className="relative -m-5 overflow-hidden bg-[var(--bg-secondary)]">
        {/* Progress Bar */}
        <div className="absolute top-0 right-0 left-0 h-1 bg-[rgba(255,255,255,0.06)]">
          <div
            className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-10">
          <div className="mt-2 mb-10 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ willChange: "opacity, transform" }}>
                <h2 className="mb-6 text-2xl font-bold tracking-tight text-white">
                  {currentStep.title}
                </h2>
                <div
                  className={`flex flex-col justify-center ${isLastStep ? "" : "min-h-[120px]"}`}>
                  {currentStep.content}
                </div>

                {/* Choice cards — only on the final step */}
                {isLastStep && (
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    {/* Offline Card */}
                    <button
                      onClick={() => setSelectedPath("offline")}
                      onMouseEnter={() => setHoveredCard("offline")}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`group relative flex flex-col rounded-xl border p-5 text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none active:scale-[0.98] ${
                        selectedPath === "offline" ? "border-white/20 bg-white/[0.04]"
                        : hoveredCard === "offline" ? "border-white/12 bg-white/[0.02]"
                        : "border-white/6 bg-white/[0.01] opacity-70"
                      }`}>
                      <div className="mb-3 flex items-center gap-2">
                        <i
                          className={`fa-solid fa-shield-halved text-sm transition-colors ${
                            selectedPath === "offline" || hoveredCard === "offline" ?
                              "text-white"
                            : "text-white/60"
                          }`}
                        />
                        <span className="text-[14px] font-semibold text-white">Use Offline</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/60">
                          Default
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">
                        No setup. All data stays local to this computer.
                      </p>
                      {/* Active border indicator */}
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-xl border-2 border-white/20"
                        initial={false}
                        animate={{ opacity: selectedPath === "offline" ? 1 : 0 }}
                        transition={{ duration: 0.15 }}
                      />
                    </button>

                    {/* Cloud Card */}
                    <button
                      onClick={() => setSelectedPath("cloud")}
                      onMouseEnter={() => setHoveredCard("cloud")}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`group relative flex flex-col rounded-xl border p-5 text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none active:scale-[0.98] ${
                        selectedPath === "cloud" ? "border-cyan-400/30 bg-cyan-500/[0.05]"
                        : hoveredCard === "cloud" ? "border-cyan-400/20 bg-cyan-500/[0.02]"
                        : "border-white/6 bg-white/[0.01] opacity-70"
                      }`}>
                      <div className="mb-3 flex items-center gap-2">
                        <i
                          className={`fa-solid fa-cloud text-sm transition-colors ${
                            selectedPath === "cloud" || hoveredCard === "cloud" ?
                              "text-cyan-400"
                            : "text-white/60"
                          }`}
                        />
                        <span className="text-[14px] font-semibold text-white">
                          Connect to Cloud
                        </span>
                      </div>
                      <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-white/50">
                        <li className="flex items-start gap-1.5">
                          <i className="fa-solid fa-check mt-[3px] text-[8px] text-cyan-400/60" />
                          <span>Access reports from any device</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <i className="fa-solid fa-check mt-[3px] text-[8px] text-cyan-400/60" />
                          <span>Sync data across multiple PCs</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <i className="fa-solid fa-check mt-[3px] text-[8px] text-cyan-400/60" />
                          <span>Manage members remotely</span>
                        </li>
                      </ul>
                      {/* Active border indicator */}
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-xl border-2 border-cyan-400/30"
                        initial={false}
                        animate={{ opacity: selectedPath === "cloud" ? 1 : 0 }}
                        transition={{ duration: 0.15 }}
                      />
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className={`rounded-lg border-none! bg-transparent! px-8 pr-5 text-[11px] font-medium shadow-none! transition-all focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none ${
                step === 0 ? "pointer-events-none opacity-0" : "text-white/55 hover:text-white"
              }`}>
              Back
            </button>

            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-[1px] transition-all duration-300 ${
                    i === step ? "w-6 bg-cyan-500" : "w-2 bg-white/10"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="btn-premium btn-premium-primary px-8! py-2! text-[11px]! font-bold! tracking-wider focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-95">
              {isLastStep ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
