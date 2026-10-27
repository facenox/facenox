import { AlertTriangle, Loader2, Check, HelpCircle, RotateCw } from "lucide-react"
import { InfoPopover } from "@/components/shared"
import type { TimeHealthOverview } from "@/components/settings/types"

export function ClockHealth({
  timeHealthState,
  onRefreshTimeHealth,
}: {
  timeHealthState: TimeHealthOverview
  onRefreshTimeHealth: () => void
}) {
  const getFriendlyTimeZoneLabel = (): string => {
    const health = timeHealthState.timeHealth
    if (!health?.current_time_local) {
      return "Local Time"
    }

    const localDate = new Date(health.current_time_local)
    const offsetMinutes = -localDate.getTimezoneOffset()
    const offsetSign = offsetMinutes >= 0 ? "+" : "-"
    const absoluteOffset = Math.abs(offsetMinutes)
    const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0")
    const offsetRemainderMinutes = String(absoluteOffset % 60).padStart(2, "0")
    const utcOffsetLabel = `UTC${offsetSign}${offsetHours}:${offsetRemainderMinutes}`

    let ianaLabel: string | null
    try {
      ianaLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      ianaLabel = null
    }

    if (ianaLabel) {
      return `${ianaLabel} (${utcOffsetLabel})`
    }

    if (health.time_zone_name?.trim()) {
      return `${health.time_zone_name.trim()} (${utcOffsetLabel})`
    }

    return utcOffsetLabel
  }

  const timeHealth = timeHealthState.timeHealth
  const timeHealthStatus = timeHealth?.online_verification_status ?? "unavailable"
  const clockWarning = timeHealth?.warning_message?.trim() || timeHealth?.os_clock_warning?.trim()
  const hasClockWarning = Boolean(clockWarning) || timeHealthStatus === "drift_detected"
  const hasClockError = Boolean(timeHealthState.error)

  const formattedLocalTime =
    timeHealth?.current_time_local ?
      new Date(timeHealth.current_time_local).toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null
  const timeHealthDetails =
    clockWarning ? clockWarning
    : timeHealthState.error ? timeHealthState.error
    : timeHealthState.loading ? "Checking clock status…"
    : timeHealthStatus === "drift_detected" ?
      "The attendance clock differs from network time. Check this computer's date and time settings."
    : timeHealthStatus === "verified" ? "No significant clock difference detected."
    : timeHealthStatus === "offline" ?
      "Network time is unavailable. The online check could not be completed."
    : timeHealthStatus === "not_checked" ?
      "Local clock protection is active. Select Check now to compare it with network time."
    : "Clock status is unavailable. Try Check now."

  return (
    <div className="mx-auto w-full max-w-[900px] px-10 pb-20">
      {/* System Time */}
      <section className="space-y-6">
        <div className="pt-2 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            System time
          </h3>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[15px] font-semibold text-white/90">System clock</h4>
              <InfoPopover
                title="System clock verification"
                description="Checks the clock used for attendance against network time and this computer's clock."
                details={[
                  "Facenox tracks elapsed time while running to reduce the effect of manual clock changes.",
                  "Warnings identify detected clock differences or timestamps earlier than recorded attendance.",
                  "Only Check now contacts Google, Cloudflare, or Microsoft to read a public HTTP time header.",
                  "The request does not include attendance records or biometric data.",
                ]}
                side="right"
              />
              {(hasClockWarning || hasClockError) && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-400/90">
                  <AlertTriangle className="size-3 text-amber-400/90" />
                  {hasClockWarning ? "Clock warning" : "Check failed"}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{timeHealthDetails}</p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] tracking-tight text-white/55">
              {hasClockWarning ?
                <AlertTriangle aria-label="Clock warning" className="size-3 text-amber-400" />
              : hasClockError ?
                <AlertTriangle aria-label="Clock check failed" className="size-3 text-amber-400" />
              : timeHealthState.loading ?
                <Loader2 className="size-3 animate-spin text-white/40" />
              : timeHealthStatus === "verified" ?
                <Check
                  aria-label="Network-time check passed"
                  className="size-3 -translate-y-0.5 stroke-[2.5] text-emerald-400"
                />
              : <HelpCircle aria-label="Status unavailable" className="size-3 text-white/40" />}
              <span>
                {timeHealthState.loading ?
                  "Checking…"
                : timeHealth ?
                  `${formattedLocalTime ?? "Unavailable"} / ${getFriendlyTimeZoneLabel()}`
                : "Clock health unavailable."}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <button
              onClick={onRefreshTimeHealth}
              disabled={timeHealthState.loading}
              className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-white/75 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.97] disabled:opacity-40">
              {timeHealthState.loading ?
                <Loader2 className="size-3 animate-spin" />
              : <RotateCw className="size-3 text-white/50" />}
              <span>{timeHealthState.loading ? "Checking…" : "Check now"}</span>
            </button>

            {!timeHealthState.loading &&
              timeHealth &&
              timeHealthStatus === "drift_detected" &&
              typeof timeHealth.online_drift_seconds === "number" && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500/70">
                  <AlertTriangle className="size-3" />
                  <span>{Math.abs(timeHealth.online_drift_seconds).toFixed(1)}s drift</span>
                </div>
              )}
          </div>
        </div>
      </section>
    </div>
  )
}
