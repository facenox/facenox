/**
 * Notifies the desktop background sync worker that local attendance,
 * group, or member data has mutated and should be debounced and pushed to the cloud.
 */
export function notifyDataChanged(): void {
  if (typeof window !== "undefined" && window.electronAPI?.sync?.triggerDebouncedSync) {
    void window.electronAPI.sync.triggerDebouncedSync()
  }
}
