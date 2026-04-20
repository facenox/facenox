import { motion, AnimatePresence } from "framer-motion"
import { useGroupUIStore } from "@/components/group/stores"
import { Tooltip } from "@/components/shared"

interface RegistrationActionProps {
  memberId: string
  isRegistered: boolean
}

export function RegistrationAction({ memberId, isRegistered }: RegistrationActionProps) {
  const jumpToRegistration = useGroupUIStore((state) => state.jumpToRegistration)

  return (
    <div className="flex items-center justify-end">
      <AnimatePresence mode="wait" initial={false}>
        {!isRegistered ?
          <motion.button
            key="register"
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            onClick={() => jumpToRegistration(memberId)}
            className="rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold tracking-tight text-cyan-400 transition-all hover:bg-cyan-500 hover:text-black active:scale-95">
            Register
          </motion.button>
        : <motion.div
            key="registered-actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Tooltip content="Re-register face">
              <button
                onClick={() => jumpToRegistration(memberId)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/5 bg-white/5 text-white/30 transition-all hover:bg-white/10 hover:text-white">
                <i className="fa-solid fa-rotate-right text-[10px]" />
              </button>
            </Tooltip>
          </motion.div>
        }
      </AnimatePresence>
    </div>
  )
}
