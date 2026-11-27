import { useState, useEffect } from 'react'
import { persistentSettings } from '@/services/PersistentSettingsService'
import type { ColumnKey, GroupByKey, ReportStatusFilter } from '@/components/group/sections/reports/types'

const areColumnsEqual = (left: ColumnKey[], right: ColumnKey[]) =>
  left.length === right.length && left.every((column, index) => column === right[index])

export function useReportViews(
  groupId: string,
  defaultColumns: ColumnKey[],
  defaultColumnPresets: ColumnKey[][] = [defaultColumns],
  defaultPageSize = 25
) {
  // Current settings state
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultColumns)
  const [groupBy, setGroupBy] = useState<GroupByKey>('none')
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('all')
  const [search, setSearch] = useState<string>('')
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [columnsFollowDefault, setColumnsFollowDefault] = useState(true)

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
          columnsFollowDefault: unknown
          pageSize: unknown
        }>

        if (s) {
          const savedColumns = Array.isArray(s.columns) ? (s.columns as ColumnKey[]) : null
          const inferredFollowDefault =
            typeof s.columnsFollowDefault === 'boolean' ? s.columnsFollowDefault
            : savedColumns ? defaultColumnPresets.some((preset) => areColumnsEqual(savedColumns, preset))
            : true

          setColumnsFollowDefault(inferredFollowDefault)

          if (inferredFollowDefault) {
            setVisibleColumns(defaultColumns)
          } else if (savedColumns) {
            setVisibleColumns(savedColumns)
          }

          if (s.groupBy) setGroupBy(s.groupBy as GroupByKey)
          if (s.pageSize) setPageSize(s.pageSize as number)
          // Note: statusFilter and search are ephemeral by design
        } else {
          setColumnsFollowDefault(true)
          setVisibleColumns(defaultColumns)
          setGroupBy('none')
        }
      } catch (err) {
        console.error('Failed to load report settings:', err)
      } finally {
        setIsInitializing(false)
      }
    }
    loadSettings()
  }, [groupId, defaultColumns, defaultColumnPresets])

  // Save Settings automatically on change
  useEffect(() => {
    if (!isInitializing) {
      persistentSettings
        .setReportScratchpad(groupId, {
          columns: visibleColumns,
          groupBy,
          pageSize,
          columnsFollowDefault
          // We don't persist statusFilter or search as they should be ephemeral
        })
        .catch(console.error)
    }
  }, [groupId, visibleColumns, groupBy, pageSize, columnsFollowDefault, isInitializing])

  const handleSetVisibleColumns = (cols: ColumnKey[]) => {
    setColumnsFollowDefault(false)
    setVisibleColumns(cols)
  }

  return {
    visibleColumns,
    setVisibleColumns: handleSetVisibleColumns,
    groupBy,
    setGroupBy,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    pageSize,
    setPageSize
  }
}
