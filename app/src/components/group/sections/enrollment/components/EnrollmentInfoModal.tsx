import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Modal } from "@/components/common"

interface EnrollmentInfoModalProps {
  isOpen: boolean
  dontShowAgain: boolean
  onClose: () => void
  onConfirm: () => void
  onDontShowAgainChange: (checked: boolean) => void
}

export function EnrollmentInfoModal({
  isOpen,
  dontShowAgain,
  onClose,
  onConfirm,
  onDontShowAgainChange,
}: EnrollmentInfoModalProps) {
  const slides = [
    {
      title: "Live or upload enrollment",
      description:
        "Enroll members live via camera or by uploading photos. Live scans match local room lighting and camera optics for optimal accuracy, while photo uploads work well for remote enrollment.",
    },
    {
      title: "Proper framing & pose",
      description:
        "Face the camera directly with open eyes and a neutral expression. Avoid dim lighting, heavy shadows, and accessories like hats or sunglasses that obstruct the face.",
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
      maxWidth="max-w-[480px]"
      title="Enrollment guidelines">
      <div className="space-y-6 py-2">
        <div className="relative min-h-[110px] overflow-hidden">
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
              <p className="text-[12px] leading-relaxed text-white/60">
                {currentSlide.description}
              </p>
            </motion.div>
          </AnimatePresence>
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
              {isLastStep ? "Continue" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
