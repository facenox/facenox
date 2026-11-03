import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Ghost, Layers, Pencil, Search, Trash2 } from "lucide-react"
import type { AttendanceGroup } from "@/types/recognition"
import { Tooltip, useDialog } from "@/components/shared"
import { EditGroup } from "@/components/group/modals/EditGroup"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { useDatabaseManagement } from "./hooks/useDatabaseManagement"
import { useCloudSyncStatus } from "@/components/common/useCloudSyncStatus"

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
  const reduceMotion = useReducedMotion()
  const [searchFocused, setSearchFocused] = useState(false)
  const [editing, setEditing] = useState<AttendanceGroup | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const { isReady, isPaired, allowKioskDirectoryManagement } = useCloudSyncStatus()
  const canManage = isReady ? !isPaired || allowKioskDirectoryManagement : null
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
  const filtered = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      group.id.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const actionClass =
    "flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-white/45 shadow-none transition-all duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 active:scale-95 disabled:opacity-40"
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-10 pt-8 pb-10">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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
            onKeyDown={(event) => {
              if (event.key !== "Escape" && event.key !== "Esc" && event.keyCode !== 27) return
              event.preventDefault()
              event.stopPropagation()
              if (event.currentTarget.value) {
                setQuery("")
              } else {
                event.currentTarget.blur()
              }
            }}
            className="h-9 w-full rounded-lg border border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none placeholder:text-white/35 focus:border-white/20 focus:bg-white/[0.08]"
          />
        </div>
      </div>
      {groups.length > 0 && filtered.length > 0 && (
        <div className="mt-4 shrink-0 text-xs text-white/55">
          {filtered.length !== groups.length ?
            `${filtered.length} of ${groups.length} group${groups.length !== 1 ? "s" : ""}`
          : `${groups.length} group${groups.length !== 1 ? "s" : ""}`}
        </div>
      )}
      {canManage === false && (
        <p className="mt-4 shrink-0 text-xs text-white/55">
          Group editing is unavailable. Check Cloud sync for organization policy and connection
          details.
        </p>
      )}
      <div className="custom-scroll hover-scrollbar mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {filtered.length > 0 ?
            <motion.div
              key="group-results"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="shrink-0 divide-y divide-white/5">
              {filtered.map((group) => (
                <div
                  key={group.id}
                  className="group/row flex w-full items-center justify-between gap-4 border-b border-l-2 border-b-white/[0.03] border-l-transparent px-6 py-2.5 transition-all duration-200 hover:border-l-cyan-400/70 hover:bg-white/[0.02]">
                  <button
                    aria-label={`Open ${group.name} members`}
                    className="min-w-0 flex-1 text-left text-white/85 transition-colors hover:text-white"
                    onClick={() => onOpenGroup?.(group)}
                    disabled={!onOpenGroup}>
                    <span className="block truncate text-[13px] font-semibold text-white/90">
                      {group.name}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                    <Tooltip content="Edit group">
                      <button
                        aria-label={`Edit ${group.name}`}
                        className={actionClass}
                        disabled={!canManage}
                        onClick={() => {
                          setEditing(group)
                          setEditOpen(true)
                        }}>
                        <Pencil aria-hidden="true" className="size-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Delete group">
                      <button
                        aria-label={`Delete ${group.name}`}
                        className={`${actionClass} hover:bg-red-500/10 hover:!text-red-400`}
                        disabled={!canManage || deletingGroup === group.id}
                        onClick={() => handleDeleteGroup(group.id)}>
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </motion.div>
          : <EmptyState
              key="empty-groups"
              className="min-h-[300px]"
              reducedMotion={!!reduceMotion}
              title={query.trim() ? "No results found" : "No groups yet"}
              description={
                query.trim() ? `No groups matched "${query.trim()}".`
                : canManage === true ?
                  "Create a group to get started."
                : "No groups are available to browse."
              }
              icon={
                query.trim() ?
                  <Ghost aria-hidden="true" className="size-8" />
                : <Layers aria-hidden="true" className="size-8" />
              }
            />
          }
        </AnimatePresence>
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
