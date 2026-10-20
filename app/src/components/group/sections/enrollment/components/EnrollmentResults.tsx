import { AlertTriangle } from "lucide-react"
import type { BulkEnrollmentResult } from "@/components/group/sections/enrollment/types"

interface EnrollmentResultsProps {
  results: BulkEnrollmentResult[]
  successCount: number
  failedCount: number
  onClose: () => void
}

export function EnrollmentResults({
  results,
  successCount,
  failedCount,
  onClose,
}: EnrollmentResultsProps) {
  return (
    <div className="flex flex-col gap-8">
      {/* Summary row — plain numbers, no cards */}
      <div className="flex items-baseline gap-6">
        <div>
          <div className="text-4xl font-light text-white tabular-nums">{successCount}</div>
          <div className="mt-0.5 text-[11px] font-medium text-white/35">enrolled</div>
        </div>
        {failedCount > 0 && (
          <>
            <div className="h-10 w-px bg-white/8" />
            <div>
              <div className="text-4xl font-light text-red-400 tabular-nums">{failedCount}</div>
              <div className="mt-0.5 text-[11px] font-medium text-white/35">failed</div>
            </div>
          </>
        )}
      </div>

      {/* Per-result list */}
      {results.length > 0 && (
        <div className="custom-scroll max-h-64 space-y-3 overflow-y-auto">
          {results.map((result, idx) => (
            <div key={idx} className="flex items-start gap-3">
              {/* Status dot */}
              <div
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  result.success ? "bg-cyan-400" : "bg-red-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[12px] font-semibold ${
                    result.success ? "text-white" : "text-red-300"
                  }`}>
                  {result.memberName || result.personId}
                </div>
                {result.error && (
                  <div className="mt-0.5 text-[11px] leading-relaxed text-red-400/60">
                    {result.error}
                  </div>
                )}
                {result.qualityWarning && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-relaxed text-amber-400/60">
                    <AlertTriangle className="size-2.5 shrink-0" />
                    {result.qualityWarning}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done — plain text button */}
      <button
        onClick={onClose}
        className="text-left text-[11px] font-semibold text-white/35 transition-colors hover:text-white/60">
        Done
      </button>
    </div>
  )
}
