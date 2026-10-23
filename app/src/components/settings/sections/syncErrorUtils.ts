export interface ParsedSyncError {
  isPlanQuota: boolean
  title: string
  description: string
  technicalDetails?: string
  currentPeople?: number
  peopleLimit?: number
  actionUrl?: string
  actionLabel?: string
}

export function isOfflineError(err: string | null): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true
  }
  if (!err) return false
  const lower = err.toLowerCase()
  return (
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("networkerror") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("ehostunreach") ||
    lower.includes("etimedout") ||
    lower.includes("no internet")
  )
}

export function formatErrorMessage(err: string | null): string {
  if (!err) return ""
  if (err.includes("<!DOCTYPE") || err.includes("<html") || err.includes("<head")) {
    return "Cloud returned an unexpected response. Check the server address in Cloud sync settings."
  }
  return err
}

export function parseSyncError(err: string | null): ParsedSyncError {
  if (!err) {
    return {
      isPlanQuota: false,
      title: "Sync paused",
      description: "Unable to complete sync.",
    }
  }

  // Quota & Plan limits
  if (
    err.includes("Plan limit exceeded") ||
    err.includes("PLAN_QUOTA_HARD_EXCEEDED") ||
    err.includes("Plan member limit exceeded") ||
    err.includes("Total active members reached")
  ) {
    const match = err.match(/reached\s+(\d+)\s*\(limit:\s*(\d+)/i)
    const currentPeople = match ? parseInt(match[1], 10) : undefined
    const peopleLimit = match ? parseInt(match[2], 10) : undefined

    return {
      isPlanQuota: true,
      title: "Plan member limit reached",
      description:
        currentPeople && peopleLimit ?
          `This computer has ${currentPeople.toLocaleString()} active members, above the Cloud plan limit of ${peopleLimit.toLocaleString()}. Review the member list or upgrade the plan before syncing again.`
        : "The active member count exceeds the Cloud plan limit. Review the member list or upgrade the plan before syncing again.",
      currentPeople,
      peopleLimit,
      actionUrl: "/pricing",
      actionLabel: "Upgrade plan",
    }
  }

  // HTML dump check
  if (err.includes("<!DOCTYPE") || err.includes("<html") || err.includes("<head")) {
    return {
      isPlanQuota: false,
      title: "Unexpected server response",
      description: formatErrorMessage(err),
      technicalDetails: err,
    }
  }

  // Clean developer prefixes (chunk indices, stack errors)
  const cleaned = err
    .replace(/^Sync failed on chunk \d+\/\d+:\s*/i, "")
    .replace(/^Sync rejected:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim()

  return {
    isPlanQuota: false,
    title: "Sync issue",
    description: cleaned || "An unexpected error occurred during sync.",
  }
}
