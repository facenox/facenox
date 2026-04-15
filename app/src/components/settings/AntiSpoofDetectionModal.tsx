import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Modal } from "@/components/common"

interface AntiSpoofDetectionModalProps {
  isOpen: boolean
  dontShowAgain: boolean
  onClose: () => void
  onConfirm: () => void
  onDontShowAgainChange: (checked: boolean) => void
}

export function AntiSpoofDetectionModal({
  isOpen,
  dontShowAgain,
  onClose,
  onConfirm,
  onDontShowAgainChange,
}: AntiSpoofDetectionModalProps) {
  const slides = [
    {
      eyebrow: "Setup 1",
      title: "Check lighting first",
      description:
        "Use even front lighting before enabling anti-spoof. Avoid dim rooms and strong backlight that can make a real face fail liveness.",
      imageSrc: "/assets/anti-spoof/check-lighting.png",
      imageAlt: "Admin setup slide showing balanced face lighting for anti-spoof setup.",
    },
    {
      eyebrow: "Setup 2",
      title: "Check framing and distance",
      description:
        "Make sure the face is large enough and centered in the camera view, so users are less likely to get stuck on move-closer or centering prompts.",
      imageSrc: "/assets/anti-spoof/check-framing.png",
      imageAlt: "Admin setup slide showing proper face framing and camera distance.",
    },
  ] as const
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const currentSlide = slides[step]
  const isFirstStep = step === 0
  const isLastStep = step === slides.length - 1
  const canNavigate = slides.length > 1

  const slideTransition = {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1] as const,
  }

  const navigateToStep = (nextStep: number) => {
    if (nextStep === step || nextStep < 0 || nextStep >= slides.length) return
    setDirection(nextStep > step ? 1 : -1)
    setStep(nextStep)
  }

  const resetSlides = () => {
    setStep(0)
    setDirection(1)
  }

  const handleClose = () => {
    resetSlides()
    onClose()
  }

  const handleConfirm = () => {
    resetSlides()
    onConfirm()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-[720px]"
      title="Check Setup Before Enabling Anti-Spoof"
      icon={<i className="fa-solid fa-shield-halved text-sm text-cyan-400/80" />}>
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(20,32,40,0.92),rgba(13,18,24,0.96))]">
          <div className="relative min-h-[248px] overflow-hidden px-4 py-3.5">
            <div className="flex items-stretch gap-3">
              <div className="relative h-[220px] w-[260px] shrink-0 overflow-hidden rounded-[18px] border border-white/8 bg-[#0d131b]">
                <AnimatePresence initial={false} mode="wait" custom={direction}>
                  <motion.img
                    key={currentSlide.imageSrc}
                    custom={direction}
                    src={currentSlide.imageSrc}
                    alt={currentSlide.imageAlt}
                    initial={(currentDirection: number) => ({
                      opacity: 0,
                      x: currentDirection > 0 ? 28 : -28,
                      scale: 0.985,
                    })}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={(currentDirection: number) => ({
                      opacity: 0,
                      x: currentDirection > 0 ? -28 : 28,
                      scale: 0.985,
                    })}
                    transition={slideTransition}
                    className="absolute inset-0 block h-[220px] w-full object-cover"
                  />
                </AnimatePresence>
              </div>

              <div className="flex min-h-[220px] min-w-0 flex-1 flex-col justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 text-[9px] font-semibold tracking-[0.18em] text-cyan-400/65 uppercase">
                    {currentSlide.eyebrow}
                  </div>
                  <div className="mb-1.5 text-[15px] font-semibold text-white/92">
                    {currentSlide.title}
                  </div>
                  <p className="max-w-[320px] text-[12px] leading-relaxed text-white/58">
                    {currentSlide.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Previous section"
                      onClick={() => navigateToStep(step - 1)}
                      disabled={!canNavigate || isFirstStep}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
                      <i className="fa-solid fa-arrow-left text-[11px]" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next section"
                      onClick={() => navigateToStep(step + 1)}
                      disabled={!canNavigate || isLastStep}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/15 bg-cyan-500/[0.08] text-cyan-300 transition-all hover:border-cyan-300/30 hover:bg-cyan-400/[0.12] hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-35">
                      <i className="fa-solid fa-arrow-right text-[11px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-white/68">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => onDontShowAgainChange(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-500"
            />
            {"Don't show this again"}
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase transition-colors hover:text-white/85">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-[10px] font-semibold tracking-[0.16em] text-slate-950 uppercase transition-colors hover:bg-cyan-400">
              Enable
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
