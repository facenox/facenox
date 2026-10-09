import { useState } from "react"
import { Modal, Spinner } from "@/components/common"

export type ExportAllGroupsFormat = "excel" | "individual" | "combined"

interface ExportAllGroupsModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (format: ExportAllGroupsFormat) => Promise<void>
  groupCount: number
  dateRangeLabel: string
}

export function ExportAllGroupsModal({
  isOpen,
  onClose,
  onExport,
  groupCount,
  dateRangeLabel,
}: ExportAllGroupsModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportAllGroupsFormat>("excel")
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await onExport(selectedFormat)
      onClose()
    } catch (err) {
      console.error("Export error:", err)
    } finally {
      setIsExporting(false)
    }
  }

  const options: Array<{
    id: ExportAllGroupsFormat
    title: string
    badge?: string
    description: string
    icon: string
  }> = [
    {
      id: "excel",
      title: "Multi-Sheet Excel Workbook",
      badge: "Recommended",
      description:
        "Creates a single Excel file with a separate tab/worksheet for each group. Cleanest for department reporting.",
      icon: "fa-solid fa-file-excel text-emerald-400",
    },
    {
      id: "individual",
      title: "Individual CSV Files per Group",
      description:
        "Downloads separate CSV files for each group. Ideal for distributing files to specific department heads.",
      icon: "fa-solid fa-folder-tree text-cyan-400",
    },
    {
      id: "combined",
      title: "Single Combined Flat CSV",
      description:
        "Exports all groups into one unified CSV file with a Group column. Best for database imports and raw data analysis.",
      icon: "fa-solid fa-file-csv text-amber-400",
    },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={isExporting ? undefined : onClose}
      title={
        <div>
          <h3 className="text-xl font-semibold">Export All Groups</h3>
          <p className="mt-1 text-xs font-normal text-white/65">
            Exporting {groupCount} groups for {dateRangeLabel}
          </p>
        </div>
      }
      maxWidth="md">
      <div className="mt-2 space-y-4">
        <div className="space-y-2.5">
          {options.map((opt) => {
            const isSelected = selectedFormat === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedFormat(opt.id)}
                disabled={isExporting}
                className={`flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all ${
                  isSelected ?
                    "border-cyan-500/50 bg-cyan-500/[0.08] shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                  : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}>
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <i className={`text-base ${opt.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/90">{opt.title}</span>
                    {opt.badge && (
                      <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-cyan-300 uppercase">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                    {opt.description}
                  </p>
                </div>
                <div className="mt-1 flex shrink-0 items-center">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border transition-all ${
                      isSelected ?
                        "border-cyan-400 bg-cyan-500 text-slate-950"
                      : "border-white/25 bg-transparent"
                    }`}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-slate-950" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-[0.97] disabled:opacity-30">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-[0.97] disabled:opacity-50">
            {isExporting ?
              <>
                <Spinner size="sm" />
                <span>Exporting…</span>
              </>
            : <>
                <i className="fa-solid fa-download text-[10px]" />
                <span>Export Now</span>
              </>
            }
          </button>
        </div>
      </div>
    </Modal>
  )
}
