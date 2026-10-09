export interface ParsedSyncError {
  isPlanQuota: boolean
  title: string
  description: string
  currentPeople?: number
  peopleLimit?: number
  actionUrl?: string
  actionLabel?: string
}

export function formatErrorMessage(err: string | null): string {
  if (!err) return ""
  if (err.includes("<!DOCTYPE") || err.includes("<html") || err.includes("<head")) {
    return "Server returned an unexpected HTML response. Verify that your cloud server is running and reachable."
  }
  return err
}

export function parseSyncError(err: string | null): ParsedSyncError {
  if (!err) {
    return {
      isPlanQuota: false,
      title: "Sync Paused",
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
      title: "Plan Member Limit Reached",
      description:
        currentPeople && peopleLimit ?
          `Your local database has ${currentPeople.toLocaleString()} active members, which exceeds your cloud plan limit of ${peopleLimit.toLocaleString()}. Cloud sync is paused until upgraded.`
        : "Your active member count exceeds your cloud plan limit. Cloud sync is paused until your plan is upgraded or excess members are deactivated.",
      currentPeople,
      peopleLimit,
      actionUrl: "/pricing",
      actionLabel: "Upgrade Plan",
    }
  }

  // HTML dump check
  if (err.includes("<!DOCTYPE") || err.includes("<html") || err.includes("<head")) {
    return {
      isPlanQuota: false,
      title: "Server Unavailable",
      description:
        "Cloud server returned an unexpected HTML response. Please verify cloud server availability.",
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
    title: "Sync Issue",
    description: cleaned || "An unexpected error occurred during sync.",
  }
}
