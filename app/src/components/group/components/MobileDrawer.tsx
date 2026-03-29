import { useEffect, useCallback } from "react"
import { Dropdown } from "@/components/shared"

import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { useGroupModals } from "@/components/group/hooks"
import { MobileNav } from "@/components/group/components/MobileNav"

export function MobileDrawer() {
  const { selectedGroup, groups, setSelectedGroup } = useGroupStore()
  const { isMobileDrawerOpen, activeSection, setActiveSection, setIsMobileDrawerOpen } =
    useGroupUIStore()
  const { openCreateGroup } = useGroupModals()

  const onClose = useCallback(() => setIsMobileDrawerOpen(false), [setIsMobileDrawerOpen])
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isMobileDrawerOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileDrawerOpen) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [isMobileDrawerOpen, onClose])

  if (!isMobileDrawerOpen) return null

  return (
    <>
      <div
        className="animate-in fade-in fixed inset-0 z-40 bg-black/60 duration-200 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform border-r border-white/10 bg-[rgba(12,16,22,0.97)] transition-transform duration-300 ease-out lg:hidden ${isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full"} `}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu">
        <div className="flex h-full flex-col pt-12 pb-5">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent p-0 text-white/70 shadow-none transition-all hover:bg-white/10 hover:text-white"
            aria-label="Close menu">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div className="border-b border-white/10 px-4 pt-1 pb-3">
            <div className="flex items-center gap-2">
              <img src="./icons/logo-transparent.png" alt="Facenox" className="h-9 w-9" />
              <h1 className="text-lg font-semibold text-white">Menu</h1>
            </div>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Dropdown
                  options={groups.map((group) => ({
                    value: group.id,
                    label: group.name,
                  }))}
                  value={selectedGroup?.id ?? null}
                  onChange={(value: string | number | null) => {
                    const groupId = value as string | null
                    if (groupId) {
                      const group = groups.find((g) => g.id === groupId)
                      setSelectedGroup(group ?? null)
                    } else {
                      setSelectedGroup(null)
                    }
                  }}
                  placeholder="Select group..."
                  emptyMessage="No groups available"
                  maxHeight={256}
                  buttonClassName="h-10"
                  allowClear={true}
                />
              </div>
              <button
                onClick={openCreateGroup}
                className="h-10 shrink-0 rounded-lg border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-[rgba(24,30,38,0.85)] hover:text-white"
                aria-label="New Group"
                title="New Group">
                Add
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <MobileNav
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              selectedGroup={selectedGroup}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </>
  )
}
