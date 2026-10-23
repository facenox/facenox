/**
 * Raw transport and backend diagnostics are shown behind a disclosure. They should
 * stay visible until the operator dismisses them instead of disappearing on a timer.
 */
export function isTechnicalErrorMessage(message: string): boolean {
  return (
    /^\s*(?:HTTP\s+\d{3}\b|(?:TypeError:\s*)?(?:fetch failed|failed to fetch)\b|(?:Connection|Backup export) failed:\s*HTTP\b|Backend (?:not available|service not started)\b)/i.test(
      message,
    ) || /^\s*<(?:!doctype|html|head)\b/i.test(message)
  )
}
