import { Tooltip } from "@/components/shared"

interface BulkUploadAreaProps {
  uploadedCount: number
  isDetecting: boolean
  onFilesSelected: (files: FileList | null) => void
  onClear: () => void
}

export function BulkUploadArea({
  uploadedCount,
  isDetecting,
  onFilesSelected,
  onClear,
}: BulkUploadAreaProps) {
  if (uploadedCount > 0) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              {isDetecting ?
                <i className="fa-solid fa-circle-notch fa-spin text-lg text-amber-400"></i>
              : <i className="fa-solid fa-circle-check text-xl text-cyan-400"></i>}
            </div>

            <div>
              <div className="text-[13px] font-bold tracking-tight text-white">
                {isDetecting ?
                  "Analyzing images..."
                : `${uploadedCount} ${uploadedCount === 1 ? "image" : "images"} uploaded`}
              </div>
              {isDetecting && (
                <div className="text-[10px] font-medium tracking-wide text-white/40 uppercase">
                  Processing faces...
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip content="Clear all files" position="top">
              <button
                onClick={onClear}
                disabled={isDetecting}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/20 text-red-200 transition hover:bg-red-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                <i className="fa-solid fa-trash text-sm"></i>
              </button>
            </Tooltip>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[rgba(28,35,44,0.82)]">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={isDetecting}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onFilesSelected(e.target.files)
                    // Reset input value to allow selecting same files again if needed
                    e.target.value = ""
                  }
                }}
              />
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Add More</span>
            </label>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <label className="group relative flex w-full max-w-lg cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-[rgba(17,22,29,0.96)] p-12 transition-all hover:border-white/30 hover:bg-[rgba(22,28,36,0.52)]">
        <div className="absolute inset-0 rounded-xl bg-linear-to-br from-cyan-500/0 to-cyan-500/0 transition-all group-hover:from-cyan-500/5 group-hover:to-transparent" />

        <div className="relative flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-[rgba(22,28,36,0.62)] transition-all group-hover:border-white/20 group-hover:bg-[rgba(28,35,44,0.82)]">
            <i className="fa-solid fa-cloud-arrow-up text-2xl text-white/40 transition-colors group-hover:text-white/60"></i>
          </div>

          <div className="text-center">
            <div className="mb-1 text-[13px] font-bold tracking-tight text-white/60 transition-colors group-hover:text-white/90">
              Drop images or click to browse
            </div>
            <div className="text-[11px] font-bold tracking-wider text-white/40 uppercase">
              Up to 50 photos • JPG, PNG supported
            </div>
          </div>
        </div>

        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
      </label>
    </div>
  )
}
