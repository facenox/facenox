import type { CapturedFrame } from "@/components/group/sections/registration/types"
import { ImagePreviewWithBbox } from "@/components/group/sections/registration/components/ImagePreviewWithBbox"

interface ResultViewProps {
  frames: CapturedFrame[]
  selectedMemberName: string
  onRetake: () => void
  onRegister: () => void
  isRegistering: boolean
  framesReady: boolean
}

export function ResultView({
  frames,
  selectedMemberName,
  onRetake,
  onRegister,
  isRegistering,
  framesReady,
}: ResultViewProps) {
  const relevantFrames = frames.filter((f) => f.angle === "Front")

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {relevantFrames.map((frame) => (
        <div key={frame.id} className="flex min-h-0 flex-1 flex-col">
          <ImagePreviewWithBbox frame={frame} />
        </div>
      ))}
      <div className="absolute top-2 left-2 z-10">
        <div className="text-md truncate font-medium text-white/80">{selectedMemberName}</div>
      </div>

      <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1.5">
        <button
          onClick={onRetake}
          className="min-w-[100px] rounded-lg border border-white/10 bg-[rgba(10,13,18,0.78)] px-2 py-2 text-xs font-medium text-white/70 transition-all hover:bg-[rgba(15,19,25,0.9)] hover:text-white">
          Retake
        </button>

        <button
          onClick={onRegister}
          disabled={!framesReady || isRegistering}
          className="flex min-w-[100px] items-center justify-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/40 px-2 py-2 text-xs font-medium text-cyan-100 transition-all hover:bg-cyan-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(10,13,18,0.78)] disabled:text-white/30">
          {isRegistering ?
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Saving...</span>
            </>
          : "Register"}
        </button>
      </div>
    </div>
  )
}
