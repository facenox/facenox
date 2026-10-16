import type { CapturedFrame } from "@/components/group/sections/enrollment/types"
import { ImagePreviewWithBbox } from "@/components/group/sections/enrollment/components/ImagePreviewWithBbox"

interface ResultViewProps {
  frames: CapturedFrame[]
  selectedMemberName: string
  onRetake: () => void
  onEnroll: () => void
  isEnrolling: boolean
  framesReady: boolean
}

export function ResultView({
  frames,
  onRetake,
  onEnroll,
  isEnrolling,
  framesReady,
}: ResultViewProps) {
  const relevantFrames = frames.filter((f) => f.angle === "Front")
  const hasError = relevantFrames.some((f) => f.status === "error")

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {relevantFrames.map((frame) => (
        <div key={frame.id} className="flex min-h-0 flex-1 flex-col">
          <ImagePreviewWithBbox frame={frame} />
        </div>
      ))}

      <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1.5">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRetake}
              className={`min-w-[100px] rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                hasError ?
                  "border-red-500/30 bg-red-500/20 text-red-200 hover:bg-red-500/30"
                : "border-white/10 bg-[rgba(10,13,18,0.78)] text-white/70 hover:bg-[rgba(15,19,25,0.9)] hover:text-white"
              }`}>
              Retake
            </button>

            {!hasError && (
              <button
                onClick={onEnroll}
                disabled={!framesReady || isEnrolling}
                className="flex min-w-[100px] items-center justify-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/40 px-2 py-2 text-xs font-medium text-cyan-100 transition-all hover:bg-cyan-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(10,13,18,0.78)] disabled:text-white/55">
                {isEnrolling ?
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <span>Saving…</span>
                  </>
                : "Enroll"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
