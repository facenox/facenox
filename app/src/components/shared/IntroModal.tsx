import { useState } from "react"
import { useUIStore } from "@/components/main/stores/uiStore"
import { Modal } from "@/components/common"

export function IntroModal() {
  const { setHasSeenIntro } = useUIStore()
  const [step, setStep] = useState(0)

  const steps = [
    {
      title: "Welcome to Suri",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Suri is a <strong>real-time</strong> attendance system built for privacy. Everything is
            processed on this device to keep your data secure and under your control.
          </p>
          <p className="text-xs text-white/50">
            Here is a quick overview of how we protect your information.
          </p>
        </div>
      ),
    },
    {
      title: "We don't save photos",
      content: (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm leading-relaxed text-white/90">
              Suri <strong>never saves actual photos</strong> of people. Instead, it creates a
              secure piece of data called a face template.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-white/50">
            This data is encrypted and cannot be turned back into a photo, keeping everyone&apos;s
            identity private.
          </p>
        </div>
      ),
    },
    {
      title: "It stays on this computer",
      content: (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm leading-relaxed text-white/90">
              All face recognition and data storage happen <strong>only on this machine</strong>.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-white/50">
            No data is sent to the internet or any cloud services unless you explicitly choose to
            sync it later.
          </p>
        </div>
      ),
    },
    {
      title: "Privacy & Security",
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-white/80">
            Suri is built to follow privacy standards like the{" "}
            <strong>Philippine Data Privacy Act</strong> and <strong>GDPR</strong>.
          </p>
          <p className="text-xs leading-relaxed text-white/50">
            As an{" "}
            <a
              href="https://github.com/suriAI/suri"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400/80 underline decoration-cyan-400/30 underline-offset-4 transition-colors hover:text-cyan-400">
              open-source project
            </a>
            , our code is transparent so you can be sure your data is handled correctly.
          </p>

          <div className="border-t border-white/5 pt-2 text-center">
            <a
              href="https://github.com/suriAI/suri/blob/main/docs/PRIVACY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-white/30 underline decoration-white/10 underline-offset-2 transition-colors hover:text-white/60">
              View Full Privacy Manual
            </a>
          </div>

          <p className="pt-1 text-center text-[10px] text-white/30 italic">
            By clicking &quot;Finish&quot;, you agree that you understand how your data is handled
            locally.
          </p>
        </div>
      ),
    },
  ]

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      setHasSeenIntro(true)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const currentStep = steps[step]

  return (
    <Modal isOpen={true} maxWidth="md" hideCloseButton={true}>
      <div className="relative -m-5 overflow-hidden bg-[#0a0a0a]">
        {/* Progress Bar */}
        <div className="absolute top-0 right-0 left-0 h-1 bg-white/5">
          <div
            className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-10">
          <div className="mt-2 mb-10">
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-white">
              {currentStep.title}
            </h2>
            <div className="flex min-h-[120px] flex-col justify-center">{currentStep.content}</div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className={`border-none! bg-transparent! px-8 pr-5 text-xs font-semibold shadow-none! transition-all ${
                step === 0 ? "pointer-events-none opacity-0" : "text-white/40 hover:text-white"
              }`}>
              Back
            </button>

            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === step ? "w-6 bg-cyan-500" : "w-2 bg-white/10"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="btn-premium btn-premium-primary px-8! py-2! text-xs! font-bold! active:scale-95">
              {step === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
