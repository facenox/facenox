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
              className={`min-w-[100px] rounded-lg px-2 py-2 text-xs transition-all active:scale-95 ${
                hasError ?
                  "bg-rose-600 font-semibold text-white shadow-sm hover:bg-rose-500"
                : "border border-white/10 bg-[#141518] font-medium text-white/70 hover:bg-[#1a1c20] hover:text-white"
              }`}>
              Retake
            </button>

            {!hasError && (
              <button
                onClick={onEnroll}
                disabled={!framesReady || isEnrolling}
                className="flex min-w-[100px] items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-black shadow-sm transition-all hover:bg-cyan-300 active:scale-95 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-[#141518] disabled:text-white/40 disabled:shadow-none">
                {isEnrolling ?
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                    <span className="font-semibold text-black">Saving…</span>
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
