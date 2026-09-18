import { useEffect, useRef, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { attendanceManager, WebSocketService } from "@/services"
import {
  useStreamState,
  useVideoStream,
  useOverlayRendering,
  useFaceDetection,
  useFaceRecognition,
  useFaceTracking,
  useAttendanceGroups,
  useBackendService,
  useCameraControl,
} from "@/components/main/hooks"
import {
  cleanupStream,
  cleanupVideo,
  cleanupAnimationFrame,
  resetLastDetectionRef,
} from "@/components/main/utils"
import {
  useCameraStore,
  useDetectionStore,
  useAttendanceStore,
  useUIStore,
} from "@/components/main/stores"
import { useGroupUIStore } from "@/components/group/stores"
import { FloatingAlert } from "@/components/common"

import { ControlBar } from "@/components/main/components/ControlBar"
import { VideoCanvas } from "@/components/main/components/VideoCanvas"
import { Sidebar } from "@/components/main/components/Sidebar"
import { MainModals } from "@/components/main/components/MainModals"
import { CooldownOverlay } from "@/components/main/components/CooldownOverlay"
import type { DetectionResult } from "@/components/main/types"
import { soundEffects } from "@/services/SoundEffectsService"

let globalStopCamera: ((forceCleanup: boolean) => void) | null = null

export default function Main() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const webSocketServiceRef = useRef<WebSocketService | null>(null)
  const isProcessingRef = useRef<boolean>(false)
  const isStreamingRef = useRef<boolean>(false)
  const lastDetectionFrameRef = useRef<ArrayBuffer | null>(null)
  const frameCounterRef = useRef(0)
  const skipFramesRef = useRef(0)
  const trackingSessionRef = useRef(0)
  const detectionInFlightRef = useRef(false)

  const lastStartTimeRef = useRef<number>(0)
  const lastStopTimeRef = useRef<number>(0)
  const isStartingRef = useRef<boolean>(false)
  const isStoppingRef = useRef<boolean>(false)

  const lastDetectionRef = useRef<DetectionResult | null>(null)
  const lastFrameTimestampRef = useRef<number>(0)
  const processCurrentFrameRef = useRef<() => Promise<void>>(async () => {})
  const previousTrackingGroupIdRef = useRef<string | null | undefined>(undefined)

  const backendServiceReadyRef = useRef(false)
  const isScanningRef = useRef(false)
  const videoRectRef = useRef<DOMRect | null>(null)
  const lastVideoRectUpdateRef = useRef<number>(0)

  const {
    isStreaming,
    isVideoLoading,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    cameraDevices,
    selectedCamera,
    setSelectedCamera,
  } = useCameraStore()

  const {
    currentDetections,
    trackedFaces,
    currentRecognitionResults: rawCurrentRecognitionResults,
  } = useDetectionStore()

  const {
    currentGroup,
    setCurrentGroup,
    attendanceGroups,
    setAttendanceGroups,
    groupMembers,
    isShellReady,
    setShowGroupManagement,
    attendanceCooldownSeconds,
    enableSpoofDetection,
    maxRecognitionFacesPerFrame,
    persistentCooldowns,
    timeHealth,
    setTimeHealth,
  } = useAttendanceStore()

  const {
    error,
    setError,
    success,
    setSuccess,
    warning,
    setWarning,
    showSettings,
    setShowSettings,
    setGroupInitialSection,
    setSettingsInitialSection,
    quickSettings,
    audioSettings,
    setSidebarCollapsed,
    pendingCloudSetup,
    setPendingCloudSetup,
  } = useUIStore()
  const showAddMemberModal = useGroupUIStore((state) => state.showAddMemberModal)
  const showEditMemberModal = useGroupUIStore((state) => state.showEditMemberModal)
  const showCreateGroupModal = useGroupUIStore((state) => state.showCreateGroupModal)
  const showEditGroupModal = useGroupUIStore((state) => state.showEditGroupModal)

  // Auto-open Settings → Sync when user chose "Connect to Cloud" during onboarding
  const hasCheckedCloudSetupRef = useRef(false)
  useEffect(() => {
    if (!hasCheckedCloudSetupRef.current && pendingCloudSetup) {
      hasCheckedCloudSetupRef.current = true
      setSettingsInitialSection("remote-sync")
      setGroupInitialSection(undefined)
      setShowSettings(true)
      setPendingCloudSetup(false)
    }
  }, [
    pendingCloudSetup,
    setSettingsInitialSection,
    setGroupInitialSection,
    setShowSettings,
    setPendingCloudSetup,
  ])

  // Preload sound to minimize delay on first recognition
  useEffect(() => {
    if (audioSettings.recognitionSoundEnabled && audioSettings.recognitionSoundUrl) {
      soundEffects.preload(audioSettings.recognitionSoundUrl)
    }
  }, [audioSettings.recognitionSoundEnabled, audioSettings.recognitionSoundUrl])

  // Auto-dismiss success alerts after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [success, setSuccess])

  // Auto-dismiss warning alerts after 8 seconds
  useEffect(() => {
    if (warning) {
      const timer = setTimeout(() => {
        setWarning(null)
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [warning, setWarning])

  const currentRecognitionResults =
    rawCurrentRecognitionResults instanceof Map ? rawCurrentRecognitionResults : new Map()

  useStreamState({
    isProcessingRef,
    animationFrameRef,
    isScanningRef,
    isStreamingRef,
    isStartingRef,
    isStoppingRef,
    lastStartTimeRef,
    lastStopTimeRef,
  })

  const { calculateAngleConsistencyRef } = useFaceTracking()

  const {
    currentGroupRef,
    memberCacheRef,
    loadAttendanceData,
    loadAttendanceDataRef,
    handleSelectGroup,
    handleCreateGroup,
    confirmDeleteGroup,
    cancelDeleteGroup,
  } = useAttendanceGroups()

  const { captureFrame, getCameraDevices } = useVideoStream({
    videoRef,
    canvasRef,
    isStreamingRef,
    isScanningRef,
    videoRectRef,
    lastVideoRectUpdateRef,
    isStartingRef,
    onDeviceDisconnected: useCallback(() => {
      globalStopCamera?.(false)
    }, []),
  })

  useFaceDetection({
    webSocketServiceRef,
    isScanningRef,
    isStreamingRef,
    captureFrame,
    lastDetectionFrameRef,
    frameCounterRef,
    skipFramesRef,
    lastFrameTimestampRef,
    lastDetectionRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
  })

  const { performFaceRecognition } = useFaceRecognition({
    currentGroupRef,
    memberCacheRef,
    calculateAngleConsistencyRef,
  })

  const { animate, resetOverlayRefs } = useOverlayRendering({
    videoRef,
    overlayCanvasRef,
    animationFrameRef,
    videoRectRef,
    lastVideoRectUpdateRef,
  })

  const stopCameraRef = useRef<((forceCleanup: boolean) => void) | null>(null)

  const { initializeWebSocket } = useBackendService({
    webSocketServiceRef,
    isStreamingRef,
    isScanningRef,
    isStartingRef,
    currentGroupId: currentGroup?.id ?? null,
    maxRecognitionFacesPerFrame,
    performFaceRecognition,
    lastFrameTimestampRef,
    lastDetectionRef,
    skipFramesRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
    stopCamera: stopCameraRef,
    animationFrameRef,
    streamRef,
    videoRef,
    backendServiceReadyRef,
    loadAttendanceDataRef,
  })

  const { startCamera, stopCamera } = useCameraControl({
    videoRef,
    streamRef,
    animationFrameRef,
    webSocketServiceRef,
    isStreamingRef,
    isScanningRef,
    isStartingRef,
    isStoppingRef,
    lastStartTimeRef,
    lastStopTimeRef,
    frameCounterRef,
    skipFramesRef,
    lastFrameTimestampRef,
    lastDetectionRef,
    lastDetectionFrameRef,
    backendServiceReadyRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
    resetOverlayRefs,
    overlayCanvasRef,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    setSelectedCamera,
    setError,
    selectedCamera,
    cameraDevices,
    initializeWebSocket,
    getCameraDevices,
  })

  useEffect(() => {
    globalStopCamera = stopCamera
    return () => {
      globalStopCamera = null
    }
  }, [stopCamera])

  const requestGroupSelection = useCallback(() => {
    setSidebarCollapsed(false)

    if (!isShellReady) {
      return
    }

    if (attendanceGroups.length === 0) {
      setShowGroupManagement(true)
      return
    }
  }, [attendanceGroups.length, isShellReady, setShowGroupManagement, setSidebarCollapsed])

  const startCameraGuarded = useCallback(() => {
    if (!currentGroup) {
      requestGroupSelection()
      return
    }
    startCamera()
  }, [currentGroup, requestGroupSelection, startCamera])

  const syncUpdatedGroupLocally = useCallback(
    (updatedGroup: typeof currentGroup) => {
      setCurrentGroup(updatedGroup)

      if (!updatedGroup) {
        return
      }

      setAttendanceGroups(
        attendanceGroups.map((group) => (group.id === updatedGroup.id ? updatedGroup : group)),
      )
    },
    [attendanceGroups, setAttendanceGroups, setCurrentGroup],
  )

  // Handle start time changes from inline chip
  const handleStartTimeChange = useCallback(
    async (newTime: string) => {
      if (!currentGroup) return

      try {
        const updatedSettings = {
          ...currentGroup.settings,
          class_start_time: newTime,
        }
        await attendanceManager.updateGroup(currentGroup.id, {
          settings: updatedSettings,
        })
        syncUpdatedGroupLocally({
          ...currentGroup,
          settings: updatedSettings,
        })
      } catch (error) {
        console.error("Failed to update start time:", error)
      }
    },
    [currentGroup, syncUpdatedGroupLocally],
  )

  const cleanupOnUnload = useCallback(() => {
    try {
      cleanupStream(streamRef)
      cleanupVideo(videoRef, true)
      cleanupAnimationFrame(animationFrameRef)

      if (webSocketServiceRef.current) {
        try {
          const wsStatus = webSocketServiceRef.current.getWebSocketStatus()
          if (wsStatus === "connected" || wsStatus === "connecting") {
            webSocketServiceRef.current.disconnect()
          }
        } catch {
          // Ignore disconnect errors
        }
      }

      isStreamingRef.current = false
      isScanningRef.current = false
      isProcessingRef.current = false
      isStartingRef.current = false
      isStoppingRef.current = false
      backendServiceReadyRef.current = false
    } catch {
      // Ignore cleanup errors
    }
  }, [])

  useEffect(() => {
    if (isStreaming) {
      animate()
    }
    return () => {
      cleanupAnimationFrame(animationFrameRef)
    }
  }, [isStreaming, animate])

  useEffect(() => {
    const currentGroupId = currentGroup?.id ?? null

    if (previousTrackingGroupIdRef.current === undefined) {
      previousTrackingGroupIdRef.current = currentGroupId
      return
    }

    if (previousTrackingGroupIdRef.current === currentGroupId) {
      return
    }

    previousTrackingGroupIdRef.current = currentGroupId

    resetLastDetectionRef(lastDetectionRef)
    useDetectionStore.getState().resetDetectionState()

    if (isStreamingRef.current) {
      stopCamera(false)
    }
  }, [currentGroup?.id, stopCamera, isStreamingRef, lastDetectionRef])

  useEffect(() => {
    let cleanupExecuted = false

    const performCleanup = () => {
      if (cleanupExecuted) return
      cleanupExecuted = true
      cleanupOnUnload()
    }

    const handleBeforeUnload = () => {
      performCleanup()
    }

    const handlePageHide = () => {
      performCleanup()
    }

    window.addEventListener("beforeunload", handleBeforeUnload, {
      capture: true,
    })
    window.addEventListener("pagehide", handlePageHide, { capture: true })

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload, {
        capture: true,
      })
      window.removeEventListener("pagehide", handlePageHide, { capture: true })
    }
  }, [cleanupOnUnload])

  // Listen for openSettings event (e.g., from WindowFooter update notification)
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent<{ section?: string }>) => {
      const section = event.detail?.section
      if (section) {
        setSettingsInitialSection(section)
        setGroupInitialSection(undefined)
      }
      setShowSettings(true)
    }

    window.addEventListener("openSettings", handleOpenSettings as EventListener)

    return () => {
      window.removeEventListener("openSettings", handleOpenSettings as EventListener)
    }
  }, [setShowSettings, setGroupInitialSection, setSettingsInitialSection])

  // Listen for system clock warnings emitted by AttendanceManager
  useEffect(() => {
    const handleClockWarning = (event: CustomEvent<{ message?: string }>) => {
      const message = event.detail?.message
      if (message) {
        setWarning(message)
      }
    }

    window.addEventListener("facenox:clock-warning", handleClockWarning as unknown as EventListener)

    return () => {
      window.removeEventListener(
        "facenox:clock-warning",
        handleClockWarning as unknown as EventListener,
      )
    }
  }, [setWarning])

  useEffect(() => {
    if (!isShellReady) return

    let isCancelled = false
    let debounceTimer: number | null = null

    const loadTimeHealth = async () => {
      try {
        const health = await attendanceManager.getTimeHealth()
        if (!isCancelled) {
          setTimeHealth(health)
        }
      } catch {
        if (!isCancelled) {
          setTimeHealth(null)
        }
      }
    }

    const debouncedLoadTimeHealth = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      debounceTimer = window.setTimeout(() => {
        void loadTimeHealth()
      }, 500)
    }

    // Initial load
    void loadTimeHealth()

    const interval = window.setInterval(
      () => {
        void loadTimeHealth()
      },
      5 * 60 * 1000,
    )

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        debouncedLoadTimeHealth()
      }
    }

    const handleOnline = () => {
      debouncedLoadTimeHealth()
    }

    window.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)

    // Hook into pure Electron native OS wake detection
    let cleanupSystemResume: (() => void) | undefined
    if (window.facenoxElectron?.onSystemResume) {
      cleanupSystemResume = window.facenoxElectron.onSystemResume(() => {
        debouncedLoadTimeHealth()
      })
    }

    return () => {
      isCancelled = true
      window.clearInterval(interval)
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
      if (cleanupSystemResume) cleanupSystemResume()
    }
  }, [isShellReady, setTimeHealth])

  const handleOpenTimeSettings = useCallback(() => {
    setSettingsInitialSection("database")
    setGroupInitialSection(undefined)
    setShowSettings(true)
  }, [setGroupInitialSection, setSettingsInitialSection, setShowSettings])

  // Handle auto-pause on minimize
  const wasStreamingBeforeMinimize = useRef(false)
  const wasStreamingBeforeBlockingGroupModal = useRef(false)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (window as any).facenoxElectron
    if (!electron) return

    const cleanupMinimize = electron.onMinimize(() => {
      if (isStreamingRef.current) {
        wasStreamingBeforeMinimize.current = true
        stopCamera(false) // Pause tracking
      } else {
        wasStreamingBeforeMinimize.current = false
      }
    })

    const cleanupRestore = electron.onRestore(() => {
      if (wasStreamingBeforeMinimize.current) {
        startCameraGuarded()
        wasStreamingBeforeMinimize.current = false
      }
    })

    return () => {
      if (cleanupMinimize) cleanupMinimize()
      if (cleanupRestore) cleanupRestore()
    }
  }, [stopCamera, startCameraGuarded])

  const hasBlockingGroupModalOpen =
    showAddMemberModal || showEditMemberModal || showCreateGroupModal || showEditGroupModal

  const lastEnrollmentMode = useGroupUIStore((state) => state.lastEnrollmentMode)

  useEffect(() => {
    const isBlockingActive = (hasBlockingGroupModalOpen || !!lastEnrollmentMode) && showSettings

    if (isBlockingActive) {
      if (isStreamingRef.current) {
        wasStreamingBeforeBlockingGroupModal.current = true
        stopCamera(false)
      }
    } else {
      if (wasStreamingBeforeBlockingGroupModal.current) {
        startCameraGuarded()
        wasStreamingBeforeBlockingGroupModal.current = false
      }
    }
  }, [hasBlockingGroupModalOpen, lastEnrollmentMode, showSettings, startCameraGuarded, stopCamera])

  const hasEnrolledFaces = groupMembers.length > 0 && groupMembers.some((m) => m.has_face_data)

  // Keyboard shortcut: Space toggles Start/Stop Scan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable)

      if (isInput || showSettings || hasBlockingGroupModalOpen) {
        return
      }

      if (e.code === "Space") {
        e.preventDefault()
        if (isStreamingRef.current) {
          stopCamera(false)
        } else {
          startCameraGuarded()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [hasBlockingGroupModalOpen, showSettings, startCameraGuarded, stopCamera])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)] text-white">
      {!showSettings && timeHealth?.online_verification_status === "drift_detected" && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-90 -translate-x-1/2">
          <button
            type="button"
            onClick={handleOpenTimeSettings}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-300/90 shadow-lg transition-all hover:bg-amber-500/15 hover:text-amber-200"
            aria-label="Open device time settings">
            <i className="fa-solid fa-triangle-exclamation text-[10px] text-amber-400" />
            Device time needs attention
          </button>
        </div>
      )}

      {/* Floating Alert System */}
      <div className="pointer-events-none absolute bottom-12 left-1/2 z-100 flex w-full -translate-x-1/2 flex-col items-center px-4">
        <AnimatePresence>
          {success && (
            <FloatingAlert message={success} variant="success" onDismiss={() => setSuccess(null)} />
          )}

          {warning && (
            <FloatingAlert message={warning} variant="warning" onDismiss={() => setWarning(null)} />
          )}

          {error && (
            <FloatingAlert message={error} variant="error" onDismiss={() => setError(null)} />
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
            <VideoCanvas
              videoRef={videoRef}
              canvasRef={canvasRef}
              overlayCanvasRef={overlayCanvasRef}
              quickSettings={quickSettings}
              isVideoLoading={isVideoLoading}
              isStreaming={isStreaming}
              isShellReady={isShellReady}
              hasSelectedGroup={Boolean(currentGroup)}
              hasEnrolledFaces={hasEnrolledFaces}
              hasGroups={attendanceGroups.length > 0}
              hasMembers={groupMembers.length > 0}
              lateTrackingEnabled={!!currentGroup?.settings?.late_threshold_enabled}
              classStartTime={currentGroup?.settings?.class_start_time}
              onStartTimeChange={handleStartTimeChange}
              currentGroup={currentGroup}
              enableSpoofDetection={enableSpoofDetection}
              attendanceCooldownSeconds={attendanceCooldownSeconds}
              maxRecognitionFacesPerFrame={maxRecognitionFacesPerFrame}
            />

            {/* New Cooldown Overlay */}
            <CooldownOverlay
              persistentCooldowns={persistentCooldowns}
              attendanceCooldownSeconds={attendanceCooldownSeconds}
            />
          </div>

          <ControlBar
            cameraDevices={cameraDevices}
            selectedCamera={selectedCamera}
            setSelectedCamera={setSelectedCamera}
            isStreaming={isStreaming}
            startCamera={startCameraGuarded}
            stopCamera={stopCamera}
            isShellReady={isShellReady}
            hasGroups={attendanceGroups.length > 0}
            hasSelectedGroup={Boolean(currentGroup)}
            hasEnrolledFaces={hasEnrolledFaces}
          />
        </div>

        <Sidebar
          currentDetections={currentDetections}
          currentRecognitionResults={currentRecognitionResults}
          recognitionEnabled={true}
          trackedFaces={trackedFaces}
          isStreaming={isStreaming}
          isVideoLoading={isVideoLoading}
          handleSelectGroup={handleSelectGroup}
          refreshAttendanceData={loadAttendanceData}
        />
      </div>

      <MainModals
        handleCreateGroup={handleCreateGroup}
        confirmDeleteGroup={confirmDeleteGroup}
        cancelDeleteGroup={cancelDeleteGroup}
        loadAttendanceDataRef={loadAttendanceDataRef}
      />
    </div>
  )
}
