import { motion, AnimatePresence } from "framer-motion"
import { RotateCw } from "lucide-react"
import { useGroupUIStore } from "@/components/group/stores"
import { Tooltip } from "@/components/shared"

interface EnrollmentActionProps {
  memberId: string
  isEnrolled: boolean
}

export function EnrollmentAction({ memberId, isEnrolled }: EnrollmentActionProps) {
  const jumpToEnrollment = useGroupUIStore((state) => state.jumpToEnrollment)

  return (
    <div className="flex items-center justify-end">
      <AnimatePresence mode="wait" initial={false}>
        {!isEnrolled ?
          <motion.button
            key="enroll"
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            onClick={() => jumpToEnrollment(memberId)}
            className="rounded-lg border border-cyan-500/10 bg-cyan-500/[0.02] px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-cyan-400/50 transition-all duration-200 group-hover:border-cyan-500/30 group-hover:bg-cyan-500/5 group-hover:text-cyan-400 hover:!border-cyan-500 hover:!bg-cyan-500/[0.16] hover:!text-cyan-300 active:scale-[0.97]">
            Enroll
          </motion.button>
        : <motion.div
            key="enrolled-actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Tooltip content="Re-enroll member">
              <button
                onClick={() => jumpToEnrollment(memberId)}
                className="flex h-7 w-7 items-center justify-center rounded border-none bg-transparent text-white/55 transition-all hover:bg-white/10 hover:text-white">
                <RotateCw className="size-3" />
              </button>
            </Tooltip>
          </motion.div>
        }
      </AnimatePresence>
    </div>
  )
}
