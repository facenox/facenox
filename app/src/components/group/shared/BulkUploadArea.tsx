import { Tooltip } from "@/components/shared"
import { Spinner } from "@/components/common"

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
      <div className="mb-6 flex items-center justify-between">
        {/* Left — status */}
        <div className="flex items-center gap-3">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            {isDetecting ?
              <Spinner size="xs" color="cyan" />
            : <i className="fa-solid fa-circle-check text-sm text-cyan-400" />}
          </div>
          <span className="text-[13px] font-semibold text-white">
            {isDetecting ?
              "Analyzing photos…"
            : `${uploadedCount} ${uploadedCount === 1 ? "image" : "images"} uploaded`}
          </span>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-4">
          <Tooltip content="Remove all" position="top">
            <button
              onClick={onClear}
              disabled={isDetecting}
              className="text-[11px] font-medium text-white/35 transition-colors hover:text-red-400 disabled:pointer-events-none disabled:opacity-40">
              Clear
            </button>
          </Tooltip>
          <div className="h-3.5 w-px bg-white/10" />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-white/55 transition-colors hover:text-white">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={isDetecting}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFilesSelected(e.target.files)
                  e.target.value = ""
                }
              }}
            />
            <i className="fa-solid fa-plus text-[10px]" />
            Add more
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="relative flex w-full max-w-lg flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-10 text-center transition-all hover:border-white/20 hover:bg-white/[0.02]">
        {/* Icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
          <i className="fa-solid fa-folder-open text-xl" />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white/90">
            Import Photos from Folder or Files
          </div>
          <p className="max-w-sm text-[11px] leading-relaxed text-white/40">
            Filenames like{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 text-cyan-300">Juan_Dela_Cruz.jpg</code>{" "}
            will be automatically matched to existing members or created as new members.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md transition-all hover:bg-cyan-400 active:scale-95">
            <i className="fa-solid fa-folder text-[11px]" />
            Choose Folder
            <input
              type="file"
              {...({
                webkitdirectory: "",
                directory: "",
              } as React.InputHTMLAttributes<HTMLInputElement>)}
              multiple
              className="hidden"
              onChange={(e) => onFilesSelected(e.target.files)}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white active:scale-95">
            <i className="fa-solid fa-images text-[11px] text-white/60" />
            Select Image Files
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFilesSelected(e.target.files)}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
