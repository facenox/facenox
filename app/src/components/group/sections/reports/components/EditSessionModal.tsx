import { useState, useEffect } from "react"
import { ErrorMessage, Modal } from "@/components/common"
import { Dropdown } from "@/components/shared"
import { attendanceManager } from "@/services/AttendanceManager"
import type { RowData } from "@/components/group/sections/reports/types"
import type { AttendanceGroup } from "@/types/recognition"
import { parseLocalDate } from "@/utils"

const REASON_PRESETS = [
  "Forgot to Scan",
  "System Error",
  "Sick Leave",
  "Emergency Leave",
  "Excused Absence",
  "Approved Remote",
  "Traffic / Delays",
  "Admin Correction",
  "Other",
] as const

type ReasonPreset = (typeof REASON_PRESETS)[number]
const OTHER_PRESET: ReasonPreset = "Other"

interface EditSessionModalProps {
  isOpen: boolean
  onClose: () => void
  row: RowData | null
  group: AttendanceGroup | null
  /** Called after a successful save. Passes the corrected message and the pre-correction row snapshot for undo. */
  onSuccess: (message: string, originalRow: RowData) => void
}

/**
 * Attendance correction modal.
 * Design: single-column, no nested panels — uses whitespace and a single
 * horizontal divider to separate sections. Selection cards are compact
 * and flat. All containers were removed to avoid the "box inside a box" feel.
 */
export function EditSessionModal({
  isOpen,
  onClose,
  row,
  group,
  onSuccess,
}: EditSessionModalProps) {
  const [status, setStatus] = useState<"present" | "absent">("present")
  const [checkInTime, setCheckInTime] = useState("")
  const [checkOutTime, setCheckOutTime] = useState("")
  const [selectedReason, setSelectedReason] = useState<ReasonPreset | "">("")
  const [customNote, setCustomNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trackCheckout = group?.settings?.track_checkout ?? false

  useEffect(() => {
    if (!row) return
    const initialStatus = row.status === "absent" ? "absent" : "present"
    setStatus(initialStatus)

    // Parse preset reason and custom note from row.notes
    let parsedReason: ReasonPreset | "" = ""
    let parsedNote = ""

    if (row.notes && row.notes !== "Manual correction by admin") {
      const match = REASON_PRESETS.find((preset) => {
        if (row.notes === preset) return true
        if (row.notes?.startsWith(`${preset} — `)) return true
        return false
      })

      if (match) {
        parsedReason = match
        parsedNote = row.notes === match ? "" : row.notes.slice(match.length + 3) // Remove the "Preset — " prefix
      } else {
        parsedNote = row.notes
      }
    }

    setSelectedReason(parsedReason)
    setCustomNote(parsedNote)

    if (row.check_in_time) {
      const d = new Date(row.check_in_time)
      setCheckInTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      )
    } else if (initialStatus !== "absent") {
      const now = new Date()
      setCheckInTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      )
    } else {
      setCheckInTime("")
    }

    if (row.check_out_time) {
      const d = new Date(row.check_out_time)
      setCheckOutTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      )
    } else {
      setCheckOutTime("")
    }

    setError(null)
  }, [row])

  const handleStatusSelect = (s: "present" | "absent") => {
    setStatus(s)
    if (s === "present" && !checkInTime) {
      const defaultTime = group?.settings?.class_start_time
      if (defaultTime) {
        setCheckInTime(defaultTime)
      } else {
        const now = new Date()
        setCheckInTime(
          `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        )
      }
    }
  }

  const resolvedNote = (): string => {
    const reason = selectedReason && selectedReason !== OTHER_PRESET ? selectedReason : ""
    const note = customNote.trim()

    if (reason && note) return `${reason} — ${note}`
    if (reason) return reason
    if (note) return note
    return "Manual correction by admin"
  }

  const handleSave = async () => {
    if (!row) return
    if (status === "present" && !checkInTime) {
      setError("Time In is required when marking as present.")
      return
    }
    if (trackCheckout && status === "present" && !checkOutTime) {
      setError("Time Out is required — the group has checkout tracking enabled.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      let finalCheckIn: Date | undefined
      let finalCheckOut: Date | undefined

      if (status === "present") {
        const baseDate = parseLocalDate(row.date)
        const [hh, mm] = checkInTime.split(":")
        const d = new Date(baseDate)
        d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0)
        finalCheckIn = d

        if (checkOutTime) {
          const [ohh, omm] = checkOutTime.split(":")
          const out = new Date(baseDate)
          out.setHours(parseInt(ohh, 10), parseInt(omm, 10), 0, 0)
          finalCheckOut = out
        }
      }

      await attendanceManager.updateSession(row.person_id, row.date, {
        status,
        notes: resolvedNote(),
        check_in_time: finalCheckIn,
        check_out_time: finalCheckOut,
        is_late: status === "present" ? (row.is_late ?? false) : false,
        late_minutes: status === "present" ? (row.late_minutes ?? 0) : 0,
      })

      onSuccess(
        `${row.name}'s attendance corrected for ${parseLocalDate(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`,
        row,
      )
    } catch (err) {
      console.error(err)
      setError("Failed to save. Please check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const [rowSnapshot, setRowSnapshot] = useState<RowData | null>(null)

  if (row && row !== rowSnapshot) {
    setRowSnapshot(row)
  }

  if (!rowSnapshot) return null

  const fmt = (d?: Date | string | null) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"

  const originalStatus = rowSnapshot.status === "no_records" ? "N/A" : rowSnapshot.status

  const statusColor =
    originalStatus === "present" ? "text-cyan-400"
    : originalStatus === "late" ? "text-orange-400"
    : originalStatus === "absent" ? "text-red-400"
    : "text-white/35"

  const reasonOptions = REASON_PRESETS.map((r) => ({
    value: r,
    label: r,
  }))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div>
          <h3 className="text-base font-semibold text-white">Correct Attendance</h3>
          <p className="mt-0.5 text-xs text-white/40">{rowSnapshot.name}</p>
        </div>
      }
      maxWidth="sm">
      <div className="mt-1">
        {/* ── Scrollable Form Body (Close 'X' stays completely static) ───── */}
        <div className="custom-scroll -mx-5 max-h-[50vh] space-y-5 overflow-y-auto px-5 pb-2">
          {/* ── Original snapshot — no box, just a quiet grid ──────────────── */}
          <div>
            <p className="mb-3 text-[10px] font-semibold tracking-widest text-white/25 uppercase">
              Original ·{" "}
              {parseLocalDate(rowSnapshot.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
            <div className="grid grid-cols-3 gap-x-4">
              <div>
                <p className="mb-0.5 text-[10px] text-white/30">Status</p>
                <p className={`text-sm font-semibold capitalize ${statusColor}`}>
                  {originalStatus}
                  {rowSnapshot.is_late && originalStatus !== "late" && (
                    <span className="ml-1 text-[11px] font-normal text-orange-400/80">· late</span>
                  )}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-[10px] text-white/30">Time In</p>
                <p className="text-sm font-semibold text-white/70">
                  {fmt(rowSnapshot.check_in_time)}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-[10px] text-white/30">Time Out</p>
                <p className="text-sm font-semibold text-white/70">
                  {fmt(rowSnapshot.check_out_time)}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.05]" />

          {/* ── Status — compact radio cards, no heavy borders ─────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
              New Status
            </p>
            <div className="flex gap-2">
              {(["present", "absent"] as const).map((s) => {
                const active = status === s
                const isPresent = s === "present"
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleStatusSelect(s)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-center transition-all duration-150 ${
                      active ?
                        isPresent ? "bg-cyan-500/10 ring-1 ring-cyan-500/30 ring-inset"
                        : "bg-red-500/10 ring-1 ring-red-500/25 ring-inset"
                      : "bg-white/[0.03] ring-1 ring-white/[0.06] ring-inset hover:bg-white/[0.05]"
                    }`}>
                    <span
                      className={`text-[12px] leading-none font-bold capitalize ${
                        active ?
                          isPresent ? "text-cyan-400"
                          : "text-red-400"
                        : "text-white/40"
                      }`}>
                      {s}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Time inputs ────────────────────────────────────────────────── */}
          {status === "present" && (
            <div className="animate-in fade-in flex gap-4 duration-200">
              {[
                {
                  label: "Time In",
                  value: checkInTime,
                  onChange: setCheckInTime,
                  required: true,
                },
                {
                  label: "Time Out",
                  value: checkOutTime,
                  onChange: setCheckOutTime,
                  required: trackCheckout,
                  hint: trackCheckout ? "Required for this group" : "Optional",
                },
              ].map(({ label, value, onChange, required, hint }) => (
                <div key={label} className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
                    {label}
                    {required && <span className="ml-1 text-red-400/60">*</span>}
                  </label>
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-full rounded-lg border border-white/8 bg-white/[0.04] px-3 text-[12px] font-medium text-white transition-colors outline-none focus:border-white/20 focus:bg-white/[0.06]"
                  />
                  {hint && (
                    <p
                      className={`text-[10px] ${trackCheckout && label === "Time Out" ? "text-amber-400/60" : "text-white/20"}`}>
                      {hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Reason ────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
              Reason
            </p>
            <Dropdown
              options={reasonOptions}
              value={selectedReason || null}
              onChange={(val) => setSelectedReason((val as ReasonPreset | null) || "")}
              placeholder="Select a reason..."
              className="w-full"
              buttonClassName="h-9 border border-white/8 bg-white/[0.04] text-[12px] font-medium text-white hover:bg-white/[0.06] focus:border-white/20"
            />

            <textarea
              placeholder={
                selectedReason === OTHER_PRESET || !selectedReason ?
                  "Describe the specific circumstance..."
                : "Add any additional details (optional)..."
              }
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              rows={2}
              className="custom-scroll w-full resize-none rounded-lg border border-white/8 bg-white/[0.04] p-3 text-[12px] font-medium text-white transition-colors duration-200 outline-none placeholder:text-white/20 focus:border-white/20 focus:bg-white/[0.06]"
            />
          </div>

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && <ErrorMessage message={error} />}
        </div>

        {/* ── Fixed Footer Actions (Docked, doesn't scroll) ──────────────── */}
        <div className="flex items-center justify-end border-t border-white/[0.05] pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 active:scale-[0.97] disabled:opacity-30">
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSave}
              className="inline-flex min-w-[108px] items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-5 py-2 text-[11px] font-bold tracking-wide text-slate-950 transition-all duration-200 hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-30">
              {isSubmitting ?
                <i className="fa-solid fa-spinner fa-spin text-[10px]" />
              : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
