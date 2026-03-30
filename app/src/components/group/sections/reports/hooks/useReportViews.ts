import { useState, useEffect } from "react"
import { persistentSettings } from "@/services/PersistentSettingsService"
import type {
  ColumnKey,
  GroupByKey,
  ReportStatusFilter,
} from "@/components/group/sections/reports/types"

export function useReportViews(groupId: string, defaultColumns: ColumnKey[]) {
  // Current settings state
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultColumns)
  const [groupBy, setGroupBy] = useState<GroupByKey>("none")
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all")
  const [search, setSearch] = useState<string>("")

  // Track if we are currently loading state to avoid overwriting during init
  const [isInitializing, setIsInitializing] = useState(true)

  // Load Scratchpad (Persistent settings)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const scratch = await persistentSettings.getReportScratchpad(groupId)
        const s = (scratch || null) as null | Partial<{
          columns: unknown
          groupBy: unknown
          statusFilter: unknown
        }>

        if (s) {
          if (Array.isArray(s.columns)) setVisibleColumns(s.columns as ColumnKey[])
          if (s.groupBy) setGroupBy(s.groupBy as GroupByKey)
          // Note: statusFilter and search are ephemeral by design
        } else {
          setVisibleColumns(defaultColumns)
          setGroupBy("none")
        }
      } catch (err) {
        console.error("Failed to load report settings:", err)
      } finally {
        setIsInitializing(false)
      }
    }
    loadSettings()
  }, [groupId, defaultColumns])

  // Save Settings automatically on change
  useEffect(() => {
    if (!isInitializing) {
      persistentSettings
        .setReportScratchpad(groupId, {
          columns: visibleColumns,
          groupBy,
          // We don't persist statusFilter or search as they should be ephemeral
        })
        .catch(console.error)
    }
  }, [groupId, visibleColumns, groupBy, isInitializing])

  return {
    visibleColumns,
    setVisibleColumns,
    groupBy,
    setGroupBy,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
  }
}
