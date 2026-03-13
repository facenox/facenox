import type { BulkRegistrationResult } from "@/components/group/sections/registration/types"

interface RegistrationResultsProps {
  results: BulkRegistrationResult[]
  successCount: number
  failedCount: number
  onClose: () => void
}

export function RegistrationResults({
  results,
  successCount,
  failedCount,
  onClose,
}: RegistrationResultsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-400/30 bg-linear-to-br from-cyan-500/10 to-cyan-600/5 p-6">
          <div className="mb-1 text-3xl font-light text-cyan-200">{successCount}</div>
          <div className="text-[11px] font-medium tracking-normal text-cyan-300/50">
            Successfully Registered
          </div>
        </div>
        <div className="rounded-lg border border-red-400/30 bg-linear-to-br from-red-500/10 to-red-600/5 p-6">
          <div className="mb-1 text-3xl font-light text-red-200">{failedCount}</div>
          <div className="text-[11px] font-medium tracking-normal text-red-300/50">
            Registration Failed
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="custom-scroll max-h-64 space-y-2 overflow-y-auto">
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                result.success ?
                  "border-cyan-400/20 bg-cyan-500/5"
                : "border-red-400/20 bg-red-500/5"
              }`}>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-lg text-sm ${
                  result.success ? "bg-cyan-500/20" : "bg-red-500/20"
                }`}>
                {result.success ? "✓" : "✕"}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium ${
                    result.success ? "text-cyan-200" : "text-red-200"
                  }`}>
                  {result.memberName || result.personId}
                </div>
                {result.error && (
                  <div className="mt-1 text-[11px] leading-relaxed font-medium text-red-300/60">
                    {result.error}
                  </div>
                )}
                {result.qualityWarning && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed font-medium text-amber-400/60">
                    <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                    {result.qualityWarning}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-bold tracking-wider text-white/50 uppercase shadow-none transition-all hover:bg-white/10 hover:text-white">
        Done
      </button>
    </div>
  )
}
