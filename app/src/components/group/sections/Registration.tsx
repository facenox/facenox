import { motion, AnimatePresence } from "framer-motion"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { CameraQueue } from "@/components/group/sections/registration/CameraQueue"
import { BulkRegistration } from "@/components/group/sections/registration/BulkRegistration"
import { FaceCapture } from "@/components/group/sections"
import { useGroupUIStore } from "@/components/group/stores"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface RegistrationProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onRefresh: () => void
  deselectMemberTrigger?: number
  onHasSelectedMemberChange?: (hasSelectedMember: boolean) => void
  onAddMember?: () => void
}

export function Registration({
  group,
  members,
  onRefresh,
  deselectMemberTrigger,
  onHasSelectedMemberChange,
  onAddMember,
}: RegistrationProps) {
  const source = useGroupUIStore((state) => state.lastRegistrationSource)
  const mode = useGroupUIStore((state) => state.lastRegistrationMode)
  const setRegistrationState = useGroupUIStore((state) => state.setRegistrationState)
  const handleBack = useGroupUIStore((state) => state.handleRegistrationBack)
  const resetRegistration = useGroupUIStore((state) => state.resetRegistration)

  const animationProps = {
    initial: { opacity: 0, scale: 0.995 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.995 },
    transition: { duration: 0.15, ease: "easeOut" as const },
    style: { willChange: "opacity, transform" },
    className: "h-full w-full",
  }

  return (
    <AnimatePresence mode="wait">
      {mode === "bulk" && source === "upload" ?
        <motion.div key="bulk-upload" {...animationProps}>
          <BulkRegistration
            group={group}
            members={members}
            onRefresh={onRefresh}
            onClose={resetRegistration}
          />
        </motion.div>
      : mode === "queue" && source === "camera" ?
        <motion.div key="camera-queue" {...animationProps}>
          <CameraQueue
            group={group}
            members={members}
            onRefresh={onRefresh}
            onClose={resetRegistration}
          />
        </motion.div>
      : mode === "single" && source ?
        <motion.div key="single-capture" {...animationProps}>
          <FaceCapture
            group={group}
            members={members}
            onRefresh={onRefresh}
            initialSource={source === "camera" ? "live" : source}
            deselectMemberTrigger={deselectMemberTrigger}
            onHasSelectedMemberChange={onHasSelectedMemberChange}
          />
        </motion.div>
      : members.length === 0 ?
        <motion.div key="empty-state" {...animationProps}>
          <EmptyState
            title="No members in this group yet"
            action={
              onAddMember ?
                {
                  label: "Add Member",
                  onClick: onAddMember,
                }
              : undefined
            }
          />
        </motion.div>
      : !source ?
        <motion.div
          key="source-selection"
          {...animationProps}
          className="flex h-full flex-col items-center justify-center px-6">
          <div className="w-full max-w-lg">
            <div className="mb-12 flex items-start justify-between">
              <div className="space-y-1">
                <h2 className="text-center text-2xl font-black tracking-tighter text-white/90">
                  How would you like to register members for{" "}
                  <span className="text-cyan-400/80">{group.name}</span>?
                </h2>
              </div>

              {source && (
                <button
                  onClick={handleBack}
                  className="group flex items-center gap-2 rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-white/50 transition-all duration-300 hover:border-white/20 hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                  <i className="fa-solid fa-arrow-left text-xs transition-transform group-hover:-translate-x-0.5"></i>
                  <span className="text-[11px] font-medium">Back</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={() => setRegistrationState("camera", null)}
                className="group relative flex flex-col items-center gap-6 rounded-[2.5rem] border border-white/10 bg-[rgba(17,22,29,0.96)] p-10 transition-all duration-300 hover:border-cyan-500/30 hover:bg-cyan-500/3">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[rgba(22,28,36,0.62)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(34,211,238,0.15)]">
                  <i className="fa-solid fa-camera-retro text-4xl text-white/40 transition-colors group-hover:text-cyan-400"></i>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-medium text-white/80 transition-colors group-hover:text-white">
                    Camera
                  </span>
                  <span className="text-[11px] font-medium text-white/20 transition-colors group-hover:text-cyan-500/60">
                    Live Capture
                  </span>
                </div>
              </button>

              <button
                onClick={() => setRegistrationState("upload", null)}
                className="group relative flex flex-col items-center gap-6 rounded-[2.5rem] border border-white/10 bg-[rgba(17,22,29,0.96)] p-10 transition-all duration-300 hover:border-cyan-500/30 hover:bg-cyan-500/3">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[rgba(22,28,36,0.62)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(34,211,238,0.15)]">
                  <i className="fa-solid fa-cloud-arrow-up text-4xl text-white/40 transition-colors group-hover:text-cyan-400"></i>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-medium text-white/80 transition-colors group-hover:text-white">
                    File
                  </span>
                  <span className="text-[11px] font-medium text-white/20 transition-colors group-hover:text-cyan-500/60">
                    Local Photos
                  </span>
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      : <motion.div
          key="mode-selection"
          {...animationProps}
          className="flex h-full flex-col items-center justify-center px-6">
          <div className="w-full max-w-lg space-y-8">
            <div className="relative space-y-2 text-center">
              <h2 className="text-2xl font-black tracking-tight text-white/90">
                Registration Method
              </h2>
              <p className="mx-auto max-w-xs text-[10px] leading-relaxed font-medium text-white/20">
                Selected Source:{" "}
                <span className="text-cyan-400/60">
                  {source === "camera" ? "Live Camera" : "Photo Upload"}
                </span>
              </p>
            </div>

            <div className="grid gap-4">
              <button
                onClick={() => setRegistrationState(source, "single")}
                className="group flex items-center gap-6 rounded-4xl border border-white/10 bg-[rgba(17,22,29,0.96)] p-6 transition-all duration-300 hover:border-cyan-500/30 hover:bg-cyan-500/3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(22,28,36,0.62)] transition-colors group-hover:bg-cyan-500/10">
                  <i className="fa-solid fa-user text-xl text-white/30 group-hover:text-cyan-400"></i>
                </div>
                <div className="text-left">
                  <span className="block text-lg font-medium text-white/80 group-hover:text-white">
                    One person
                  </span>
                  <span className="text-[11px] font-medium text-white/20 transition-colors group-hover:text-cyan-500/60">
                    One member at a time
                  </span>
                </div>
              </button>

              {source === "upload" && (
                <button
                  onClick={() => setRegistrationState(source, "bulk")}
                  className="group flex items-center gap-6 rounded-4xl border border-white/10 bg-[rgba(17,22,29,0.96)] p-6 transition-all duration-300 hover:border-cyan-500/30 hover:bg-cyan-500/3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(22,28,36,0.62)] transition-colors group-hover:bg-cyan-500/10">
                    <i className="fa-solid fa-layer-group text-xl text-white/30 group-hover:text-cyan-400"></i>
                  </div>
                  <div className="text-left">
                    <span className="block text-lg font-medium text-white/80 group-hover:text-white">
                      Multiple photos
                    </span>
                    <span className="text-[11px] font-medium text-white/20 transition-colors group-hover:text-cyan-500/60">
                      Upload several portraits
                    </span>
                  </div>
                </button>
              )}

              {source === "camera" && (
                <button
                  onClick={() => setRegistrationState(source, "queue")}
                  className="group flex items-center gap-6 rounded-4xl border border-white/10 bg-[rgba(17,22,29,0.96)] p-6 transition-all duration-300 hover:border-cyan-500/30 hover:bg-cyan-500/3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[rgba(22,28,36,0.62)] transition-colors group-hover:bg-cyan-500/10">
                    <i className="fa-solid fa-users-viewfinder text-xl text-white/30 group-hover:text-cyan-400"></i>
                  </div>
                  <div className="text-left">
                    <span className="block text-lg font-medium text-white/80 group-hover:text-white">
                      Queue
                    </span>
                    <span className="text-[11px] font-medium text-white/20 transition-colors group-hover:text-cyan-500/60">
                      Multi-member capture
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      }
    </AnimatePresence>
  )
}
