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
      title: "Use balanced lighting",
      description: "Ensure even front lighting. Avoid direct glare and deep shadows.",
      imageSrc: "./assets/anti-spoof/check-lighting.png",
      imageAlt: "Admin setup slide showing balanced face lighting for anti-spoof setup.",
    },
    {
      title: "Frame the face properly",
      description: "Position the camera at eye level and keep faces centered.",
      imageSrc: "./assets/anti-spoof/check-framing.png",
      imageAlt: "Admin setup slide showing proper face framing and camera distance.",
    },
    {
      title: "Keep the camera clear",
      description: "Keep the camera lens clean and smudge-free for sharp detection.",
      imageSrc: "./assets/anti-spoof/check-camera-clarity.png",
      imageAlt:
        "Admin setup slide showing a clear camera lens and sharp face preview for anti-spoof setup.",
    },
    {
      title: "Motion verification",
      description:
        "Users will be prompted to gently turn their head once to confirm physical presence.",
      imageSrc: "./assets/anti-spoof/check-head-turn.png",
      imageAlt: "Admin setup slide showing motion verification for anti-spoof setup.",
    },
  ] as const
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const currentSlide = slides[step]
  const isLastStep = step === slides.length - 1

  const slideTransition = {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1] as const,
  }

  const slideVariants = {
    enter: (currentDirection: number) => ({
      opacity: 0,
      x: currentDirection > 0 ? 28 : -28,
      scale: 0.985,
    }),
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (currentDirection: number) => ({
      opacity: 0,
      x: currentDirection > 0 ? -28 : 28,
      scale: 0.985,
    }),
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
      maxWidth="max-w-[640px]"
      title="Before Enabling Liveness">
      <div className="space-y-6 py-2">
        {/* Content Area */}
        <div className="relative min-h-[220px] overflow-hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-6">
            <div className="relative h-[220px] w-[260px] shrink-0 overflow-hidden rounded-[18px] border border-white/8 bg-[#0d131b]">
              <AnimatePresence initial={false} mode="wait" custom={direction}>
                <motion.img
                  key={currentSlide.imageSrc}
                  custom={direction}
                  src={currentSlide.imageSrc}
                  alt={currentSlide.imageAlt}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={slideTransition}
                  className="absolute inset-0 block h-[220px] w-full object-cover"
                />
              </AnimatePresence>
            </div>

            <div className="relative flex min-h-[220px] min-w-0 flex-1 flex-col justify-start overflow-hidden pt-3">
              <AnimatePresence initial={false} mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={slideTransition}
                  className="w-full">
                  <div className="mb-2 text-[15px] font-semibold text-white/92">
                    {currentSlide.title}
                  </div>
                  <p className="max-w-[320px] text-[12px] leading-relaxed text-white/60">
                    {currentSlide.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-white/70">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => onDontShowAgainChange(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none"
            />
            {"Don't show this again"}
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => navigateToStep(step - 1)}
              className="flex h-9 w-24 items-center justify-center rounded-lg text-[10px] font-semibold tracking-[0.16em] text-white/55 uppercase transition-all duration-200 hover:bg-white/5 hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30">
              Back
            </button>
            <button
              type="button"
              onClick={isLastStep ? handleConfirm : () => navigateToStep(step + 1)}
              className="flex h-9 w-24 items-center justify-center rounded-lg bg-cyan-500 text-[10px] font-semibold tracking-[0.16em] text-slate-950 uppercase transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
              {isLastStep ? "Enable" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
