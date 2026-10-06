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
      <label className="group relative flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-5 p-12 transition-all">
        {/* Icon — minimal, no box */}
        <div className="flex h-12 w-12 items-center justify-center opacity-30 transition-opacity group-hover:opacity-50">
          <i className="fa-solid fa-arrow-up-from-bracket text-2xl text-white" />
        </div>

        <div className="text-center">
          <div className="mb-1.5 text-[13px] font-semibold text-white/60 transition-colors group-hover:text-white/90">
            Drop images or click to browse
          </div>
          <div className="text-[11px] font-medium text-white/30">
            JPG, PNG · up to 50 photos at once
          </div>
        </div>

        {/* Dashed indicator — very subtle */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl border border-dashed border-white/8 transition-all group-hover:border-white/15" />

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
