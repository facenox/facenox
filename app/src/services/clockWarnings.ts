export const ATTENDANCE_TIMEZONE_MISMATCH_WARNING_KEY = "attendance-timezone-mismatch"

export interface ClockWarningDetail {
  message?: string
  dedupeKey?: string
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
