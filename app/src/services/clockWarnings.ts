export const ATTENDANCE_TIMEZONE_MISMATCH_WARNING_KEY = "attendance-timezone-mismatch"

export interface ClockWarningDetail {
  message?: string
  dedupeKey?: string
}

interface ClockHealthWarning {
  warning_message?: string | null
  os_clock_warning?: string | null
  online_verification_status?: string
  timezone_mismatch?: boolean
  device_time_zone_name?: string | null
  attendance_time_zone_name?: string | null
  timezone_warning_message?: string | null
}

export function clockWarningFromHealth(
  health?: ClockHealthWarning | null,
): ClockWarningDetail | null {
  if (!health) return null
  const clockMessage = health.warning_message?.trim() || health.os_clock_warning?.trim()
  const timezoneMessage = health.timezone_warning_message?.trim()
  const timezoneKey = [
    ATTENDANCE_TIMEZONE_MISMATCH_WARNING_KEY,
    health.device_time_zone_name?.trim(),
    health.attendance_time_zone_name?.trim(),
  ]
    .filter(Boolean)
    .join(":")

  // Actual drift/backdating always takes priority and must never be swallowed
  // by the once-per-timezone-pair advisory. Support older combined responses.
  if (clockMessage) {
    const legacyTimezoneOnly =
      health.timezone_mismatch &&
      !timezoneMessage &&
      !health.os_clock_warning?.trim() &&
      health.online_verification_status !== "drift_detected"
    return { message: clockMessage, ...(legacyTimezoneOnly ? { dedupeKey: timezoneKey } : {}) }
  }
  return timezoneMessage ? { message: timezoneMessage, dedupeKey: timezoneKey } : null
}

export function dispatchClockWarning(message: string, dedupeKey?: string): void {
  window.dispatchEvent(
    new CustomEvent<ClockWarningDetail>("facenox:clock-warning", {
      detail: { message, dedupeKey },
    }),
  )
}

export function consumeClockWarning(
  detail: ClockWarningDetail | undefined,
  shownKeys: Set<string>,
): string | null {
  const message = detail?.message?.trim()
  if (!message) return null

  const dedupeKey = detail?.dedupeKey?.trim()
  if (dedupeKey) {
    if (shownKeys.has(dedupeKey)) return null
    shownKeys.add(dedupeKey)
  }

  return message
}
