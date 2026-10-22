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
    timeHealthState.loading ? "Verifying clock accuracy…"
    : timeHealthStatus === "verified" ? "System clock is verified and accurate."
    : timeHealthStatus === "drift_detected" ?
      "Device clock is out of sync. Adjust date and time settings to prevent logging errors."
    : timeHealthStatus === "offline" ? "Cannot verify time online."
    : "Could not read the current time authority status."

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
                description="Compares your device time with network time to ensure accurate attendance timestamps."
                details={[
                  "Prevents attendance tampering caused by manually changing the computer's clock.",
                  "Alerts you when the device clock is out of sync or drifting from real time.",
                  "Ensures attendance logs stay in chronological order even offline.",
                ]}
                side="right"
              />
              {timeHealthStatus === "drift_detected" && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-400/90">
                  <AlertTriangle className="size-3 text-amber-400/90" />
                  Drift warning
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{timeHealthDetails}</p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] tracking-tight text-white/55">
              {timeHealthState.loading ?
                <Loader2 className="size-3 animate-spin text-white/40" />
              : timeHealthStatus === "verified" ?
                <Check
                  aria-label="System clock verified"
                  className="size-3 -translate-y-0.5 stroke-[2.5] text-emerald-400"
                />
              : timeHealthStatus === "drift_detected" ?
                <AlertTriangle
                  aria-label="Device clock out of sync"
                  className="size-3 text-amber-400"
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
