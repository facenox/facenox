import { useEffect, useState } from "react"
import { Pencil, Search, Trash2 } from "lucide-react"
import type { AttendanceGroup } from "@/types/recognition"
import { Tooltip, useDialog } from "@/components/shared"
import { EditGroup } from "@/components/group/modals/EditGroup"
import { useDatabaseManagement } from "./hooks/useDatabaseManagement"

export function Groups({
  groups,
  onGroupsChanged,
  onOpenGroup,
  onManagementChange,
}: {
  groups: AttendanceGroup[]
  onGroupsChanged?: () => void
  onOpenGroup?: (group: AttendanceGroup) => void
  onManagementChange?: (allowed: boolean) => void
}) {
  const [query, setQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [editing, setEditing] = useState<AttendanceGroup | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [canManage, setCanManage] = useState<boolean | null>(null)
  useEffect(() => {
    onManagementChange?.(canManage === true)
    return () => onManagementChange?.(false)
  }, [canManage, onManagementChange])
  const dialog = useDialog()
  const { handleDeleteGroup, deletingGroup } = useDatabaseManagement(
    groups,
    onGroupsChanged,
    dialog,
    false,
  )
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const config = await window.electronAPI.sync.getConfig()
        if (active)
          setCanManage(
            !config.connected ||
              (config as { allowKioskDirectoryManagement?: boolean })
                .allowKioskDirectoryManagement !== false,
          )
      } catch {
        if (active) setCanManage(false)
      }
    }
    void refresh()
    const unsubscribe = window.electronAPI?.sync?.onDataChanged(() => {
      void refresh()
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])
  const filtered = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      group.id.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const actionClass =
    "flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-white/55 shadow-none transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 active:scale-95 disabled:opacity-40"
  return (
    <div className="w-full space-y-4 px-10 pt-8 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className={`group/bar relative w-full transition-all duration-300 ease-out motion-reduce:transition-none ${searchFocused || query.trim() ? "max-w-[190px]" : "max-w-[170px]"}`}>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/bar:text-white/45"
          />
          <input
            aria-label="Search groups"
            type="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search groups…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-full rounded-lg border border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none placeholder:text-white/35 focus:border-white/20 focus:bg-white/[0.08]"
          />
        </div>
      </div>
      {groups.length > 0 && filtered.length > 0 && (
        <div className="text-xs text-white/55">
          {filtered.length !== groups.length ?
            `${filtered.length} of ${groups.length} group${groups.length !== 1 ? "s" : ""}`
          : `${groups.length} group${groups.length !== 1 ? "s" : ""}`}
        </div>
      )}
      {canManage === false && (
        <p className="text-xs text-white/55">
          Group editing is unavailable. Check Cloud sync for organization policy and connection
          details.
        </p>
      )}
      <div className="divide-y divide-white/5">
        {filtered.map((group) => (
          <div
            key={group.id}
            className="group/row flex items-center gap-3 px-2 py-3.5 transition-colors hover:bg-white/[0.01]">
            <button
              aria-label={`Open ${group.name} members`}
              className="min-w-0 flex-1 text-left text-white/85 hover:text-white"
              onClick={() => onOpenGroup?.(group)}
              disabled={!onOpenGroup}>
              <span className="block truncate text-[13px] font-semibold text-white/90">
                {group.name}
              </span>
            </button>
            <div className="flex items-center gap-1.5 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:hover)]:opacity-0">
              <Tooltip content="Edit group">
                <button
                  aria-label={`Edit ${group.name}`}
                  className={actionClass}
                  disabled={!canManage}
                  onClick={() => {
                    setEditing(group)
                    setEditOpen(true)
                  }}>
                  <Pencil aria-hidden="true" className="size-3" />
                </button>
              </Tooltip>
              <Tooltip content="Delete group">
                <button
                  aria-label={`Delete ${group.name}`}
                  className={`${actionClass} hover:!text-red-400`}
                  disabled={!canManage || deletingGroup === group.id}
                  onClick={() => handleDeleteGroup(group.id)}>
                  <Trash2 aria-hidden="true" className="size-3" />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-white/55">
            {query.trim() ? "No matching groups." : "No groups yet. Create a group to get started."}
          </p>
        )}
      </div>
      {editing && (
        <EditGroup
          isOpen={editOpen}
          group={editing}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false)
            onGroupsChanged?.()
          }}
        />
      )}
    </div>
  )
}
