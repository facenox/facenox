import { useState, useEffect, useCallback, memo, useRef } from "react"
import { motion } from "framer-motion"
import { Tooltip } from "@/components/shared"
import type { AttendanceGroup, DetectionResult, TrackedFace } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils"
import { AttendancePanel } from "@/components/main/components/AttendancePanel"
import { DetectionPanel } from "@/components/main/components/DetectionPanel"

import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { updaterService } from "@/services"
import type { UpdateInfo } from "@/types/updater"

interface SidebarProps {
  currentDetections: DetectionResult | null
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>
  recognitionEnabled: boolean
  trackedFaces: Map<string, TrackedFace>
  isStreaming: boolean
  isVideoLoading: boolean

  handleSelectGroup: (group: AttendanceGroup) => void
  refreshAttendanceData: () => Promise<void>
}

const MIN_WIDTH = 56
const MIN_EXPANDED_WIDTH = 240
const MAX_WIDTH = 340

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] text-white/65 transition-colors duration-200 group-hover:text-white"
      aria-hidden="true">
      {
        collapsed ?
          // PanelRightOpen: Right sidebar, arrow pointing left to pull open
          <>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M15 3v18" />
            <path d="m10 15-3-3 3-3" />
          </>
          // PanelRightClose: Right sidebar, arrow pointing right to push close
        : <>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M15 3v18" />
            <path d="m8 9 3 3-3 3" />
          </>

      }
    </svg>
  )
}

function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export const Sidebar = memo(function Sidebar({
  currentDetections,
  currentRecognitionResults,
  recognitionEnabled,
  trackedFaces,
  isStreaming,
  isVideoLoading,
  handleSelectGroup,
  refreshAttendanceData,
}: SidebarProps) {
  const { groupMembers, persistentCooldowns, currentGroup } = useAttendanceStore()
  const {
    setShowSettings,
    sidebarCollapsed: isCollapsed,
    setSidebarCollapsed: setIsCollapsed,
    sidebarWidth,
    setSidebarWidth,
    isHydrated,
  } = useUIStore()

  const [isResizing, setIsResizing] = useState(false)
  const isResizingRef = useRef(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const currentResizeWidth = useRef(0)
  const originalTransition = useRef<string>("")

  const isInitialized = isHydrated

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    const unsubscribe = updaterService.onUpdateInfoChanged((info) => {
      setUpdateInfo(info)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    isResizingRef.current = isResizing
  }, [isResizing])

  const toggleSidebar = useCallback(() => {
    if (sidebarRef.current && isInitialized) {
      sidebarRef.current.style.transition = ""
    }
    setIsCollapsed(!isCollapsed)
  }, [isInitialized, isCollapsed, setIsCollapsed])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (isCollapsed) return

      resizeStartX.current = e.clientX
      resizeStartWidth.current = sidebarWidth
      currentResizeWidth.current = sidebarWidth
      isResizingRef.current = true
      setIsResizing(true)

      if (sidebarRef.current) {
        originalTransition.current = sidebarRef.current.style.transition || ""
        sidebarRef.current.style.transition = "none"
      }
    },
    [isCollapsed, sidebarWidth],
  )

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !sidebarRef.current) return

    const delta = resizeStartX.current - e.clientX
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_EXPANDED_WIDTH, resizeStartWidth.current + delta),
    )

    currentResizeWidth.current = newWidth
    sidebarRef.current.style.width = `${newWidth}px`
    sidebarRef.current.style.minWidth = `${newWidth}px`
    sidebarRef.current.style.maxWidth = `${newWidth}px`
  }, [])

  const handleResizeEnd = useCallback(() => {
    if (!isResizingRef.current) return

    let finalWidth = currentResizeWidth.current

    if (sidebarRef.current && (!finalWidth || finalWidth < MIN_EXPANDED_WIDTH)) {
      const domWidth = parseFloat(sidebarRef.current.style.width)
      if (!isNaN(domWidth) && domWidth >= MIN_EXPANDED_WIDTH) {
        finalWidth = domWidth
      }
    }

    if (!finalWidth || finalWidth < MIN_EXPANDED_WIDTH) {
      finalWidth = sidebarWidth
    }

    finalWidth = Math.min(MAX_WIDTH, Math.max(MIN_EXPANDED_WIDTH, finalWidth))

    setSidebarWidth(finalWidth)
    setIsResizing(false)
    isResizingRef.current = false

    if (sidebarRef.current) {
      sidebarRef.current.style.transition = originalTransition.current
    }
  }, [sidebarWidth, setSidebarWidth])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove)
      document.addEventListener("mouseup", handleResizeEnd)
      document.body.style.cursor = "ew-resize"
      document.body.style.userSelect = "none"

      return () => {
        document.removeEventListener("mousemove", handleResizeMove)
        document.removeEventListener("mouseup", handleResizeEnd)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault()
        toggleSidebar()
      }

      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault()
        setShowSettings(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar, setShowSettings])

  const currentWidth = isCollapsed ? MIN_WIDTH : sidebarWidth

  useEffect(() => {
    if (isInitialized && !isResizing && sidebarRef.current) {
      const expectedWidth = isCollapsed ? MIN_WIDTH : sidebarWidth
      sidebarRef.current.style.width = `${expectedWidth}px`
      sidebarRef.current.style.minWidth = `${expectedWidth}px`
      sidebarRef.current.style.maxWidth = `${expectedWidth}px`
    }
  }, [isCollapsed, sidebarWidth, isResizing, isInitialized])

  return (
    <>
      <div
        ref={sidebarRef}
        className={`relative z-50 flex h-full flex-col overflow-hidden border-l border-white/10 bg-[rgba(15,19,25,0.88)] ${isInitialized ? "transition-all duration-300 ease-in-out" : ""}`}
        style={{
          width: `${currentWidth}px`,
          minWidth: `${currentWidth}px`,
          maxWidth: `${currentWidth}px`,
          willChange: "width",
        }}>
        <div
          className={`border-b border-white/10 px-3 py-1 transition-opacity duration-200 ${isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"}`}
          style={{ minWidth: isResizing ? undefined : sidebarWidth }}>
          <div className="flex items-center justify-between gap-2">
            <Tooltip
              content={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              position="right"
              offset={-10}>
              <button
                onClick={toggleSidebar}
                className="sidebar-toggle-btn group flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent transition-all duration-200 hover:bg-white/[0.06] active:scale-95"
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                <SidebarToggleIcon collapsed={false} />
              </button>
            </Tooltip>

            <Tooltip
              content={updateInfo?.hasUpdate ? "Update available!" : "Settings"}
              position="left"
              offset={0}
              disabled={isCollapsed}>
              <motion.button
                onClick={() => {
                  setShowSettings(true)
                  if (updateInfo?.hasUpdate) {
                    useUIStore.getState().setSettingsInitialSection("about")
                  }
                }}
                className="group relative flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent transition-all duration-200 hover:bg-white/[0.06] active:scale-95"
                disabled={isCollapsed}
                aria-label="Open Settings"
                initial="initial"
                whileHover="hover">
                <motion.div
                  className="flex items-center justify-center text-white/65 transition-colors group-hover:text-white"
                  variants={{
                    initial: { rotate: 0 },
                    hover: { rotate: 90 },
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                  <SettingsIcon className="h-[18px] w-[18px]" />
                </motion.div>

                {updateInfo?.hasUpdate && (
                  <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-[1px] border border-black bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.6)]"></div>
                )}
              </motion.button>
            </Tooltip>
          </div>
        </div>

        <div
          className={`sidebar relative flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"}`}
          style={{ minWidth: isResizing ? undefined : sidebarWidth }}>
          {!isCollapsed && (
            <Tooltip content="Drag to resize" position="right">
              <div
                className="group absolute top-0 bottom-0 left-0 z-30 w-1 cursor-ew-resize transition-colors hover:bg-cyan-500/30 active:bg-cyan-500/50"
                onMouseDown={handleResizeStart}
                style={{
                  paddingLeft: "2px",
                  marginLeft: "-2px",
                }}>
                <div
                  className={`absolute top-1/2 left-0 h-12 w-1 -translate-y-1/2 rounded-r transition-all ${
                    isResizing ? "h-16 bg-cyan-500/70" : "bg-white/10 group-hover:bg-cyan-500/50"
                  }`}
                />
              </div>
            </Tooltip>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AttendancePanel
              handleSelectGroup={handleSelectGroup}
              refreshAttendanceData={refreshAttendanceData}
            />
          </div>

          <div className="hover-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-white/10 bg-[rgba(10,13,18,0.96)]">
            <DetectionPanel
              currentDetections={currentDetections}
              currentRecognitionResults={currentRecognitionResults}
              recognitionEnabled={recognitionEnabled}
              trackedFaces={trackedFaces}
              groupMembers={groupMembers}
              isStreaming={isStreaming}
              isVideoLoading={isVideoLoading}
              persistentCooldowns={persistentCooldowns}
              currentGroupId={currentGroup?.id}
            />
          </div>
        </div>

        {isCollapsed && (
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 pt-1 pb-0">
            <Tooltip content="Expand sidebar" position="left">
              <button
                onClick={toggleSidebar}
                className="sidebar-toggle-btn group flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent transition-all duration-200 hover:bg-white/[0.06] active:scale-95"
                aria-label="Expand sidebar">
                <SidebarToggleIcon collapsed={true} />
              </button>
            </Tooltip>

            <Tooltip
              content={updateInfo?.hasUpdate ? "Update available!" : "Settings"}
              position="left">
              <motion.button
                onClick={() => {
                  setShowSettings(true)
                  if (updateInfo?.hasUpdate) {
                    useUIStore.getState().setSettingsInitialSection("about")
                  }
                }}
                className="group relative flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent transition-all duration-200 hover:bg-white/[0.06] active:scale-95"
                aria-label="Open Settings"
                initial="initial"
                whileHover="hover">
                <motion.div
                  className="flex items-center justify-center text-white/65 transition-colors group-hover:text-white"
                  variants={{
                    initial: { rotate: 0 },
                    hover: { rotate: 90 },
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                  <SettingsIcon className="h-[18px] w-[18px]" />
                </motion.div>

                {/* Update Badge */}
                {updateInfo?.hasUpdate && (
                  <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full border border-black bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.6)]"></div>
                )}
              </motion.button>
            </Tooltip>

            <div className="mt-2 h-px w-full bg-white/10"></div>
          </div>
        )}
      </div>
    </>
  )
})
