import { useState } from "react"
import { useUIStore } from "@/components/main/stores/uiStore"
import { Modal } from "@/components/common"
import { motion, AnimatePresence } from "framer-motion"
import { Cloud, Check } from "lucide-react"

/**
 * First-launch intro flow that educates users about privacy and on-device architecture,
 * followed by a streamlined prompt highlighting Facenox Cloud with a seamless opt-out.
 *
 * Steps 1–2: On-device architecture & biometric data protection
 * Step 3: Facenox Cloud value proposition with "Connect" CTA and "Skip for now"
 */
export function IntroModal() {
  const { setHasSeenIntro, setPendingCloudSetup } = useUIStore()
  const [step, setStep] = useState(0)
  const [isOpen, setIsOpen] = useState(true)

  const steps = [
    {
      title: "On-device face recognition",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Facenox runs face detection, tracking, liveness verification, and recognition directly{" "}
            <strong>on this computer</strong>.
          </p>
          <p className="text-xs leading-relaxed text-white/65">
            Attendance is recorded continuously even during power or internet disruptions. When
            connected, records automatically mirror to your central dashboard.
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
      title: "Access records anywhere with Cloud",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Monitor daily activity and manage records from anywhere.
          </p>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="size-4 text-cyan-400" />
                <span className="text-xs font-semibold text-white">
                  Included with Facenox Cloud
                </span>
              </div>
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                Recommended
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-2 text-xs text-white/70">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                <span>Live attendance dashboard accessible on any phone or browser</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                <span>Automatic off-site backup if this computer is damaged or lost</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                <span>Multi-device synchronization across multiple branches or gates</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                <span>Employee portal with time-card (DTR) reviews and approvals</span>
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-white/50">
            You can connect or disconnect anytime in{" "}
            <span className="text-white/70">Settings → Cloud sync</span>.
          </p>
        </div>
      ),
    },
  ]

  /** Completes the intro and optionally sets the cloud setup flag. */
  const handleFinish = (enableCloud: boolean) => {
    if (enableCloud) {
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
        {/* Progress Bar */}
        <div className="absolute top-0 right-0 left-0 h-1 bg-[rgba(255,255,255,0.06)]">
          <div
            className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-8 sm:p-10">
          <div className="mt-2 mb-8 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ willChange: "opacity, transform" }}>
                <h2 className="mb-5 text-2xl font-bold tracking-tight text-white">
                  {currentStep.title}
                </h2>
                <div className="flex min-h-[140px] flex-col justify-center">
                  {currentStep.content}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className={`rounded-lg border-none! bg-transparent! px-3 py-1.5 text-xs font-medium shadow-none! transition-all focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none ${step === 0 ? "pointer-events-none opacity-0" : "text-white/55 hover:text-white"
                }`}>
              Back
            </button>

            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-[1px] transition-all duration-300 ${i === step ? "w-6 bg-cyan-500" : "w-2 bg-white/10"
                    }`}
                />
              ))}
            </div>

            {isLastStep ?
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFinish(false)}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition-colors hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-5 py-2 text-xs font-bold tracking-wide text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                  <Cloud className="size-3.5" />
                  <span>Connect</span>
                </button>
              </div>
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
