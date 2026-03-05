import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "@/components/settings";
import { attendanceManager, BackendService } from "@/services";
import {
  useStreamState,
  useAttendanceCooldown,
  useVideoStream,
  useOverlayRendering,
  useFaceDetection,
  useFaceRecognition,
  useFaceTracking,
  useAttendanceGroups,
  useBackendService,
  useCameraControl,
} from "@/components/main/hooks";
import {
  cleanupStream,
  cleanupVideo,
  cleanupAnimationFrame,
  resetLastDetectionRef,
} from "@/components/main/utils";
import {
  useCameraStore,
  useDetectionStore,
  useAttendanceStore,
  useUIStore,
} from "@/components/main/stores";

import { ControlBar } from "@/components/main/components/ControlBar";
import { VideoCanvas } from "@/components/main/components/VideoCanvas";
import { Sidebar } from "@/components/main/components/Sidebar";
import { GroupManagementModal } from "@/components/main/components/GroupManagementModal";
import { DeleteConfirmationModal } from "@/components/main/components/DeleteConfirmationModal";
import { CooldownOverlay } from "@/components/main/components/CooldownOverlay";
import type { DetectionResult } from "@/components/main/types";
import { soundEffects } from "@/services/SoundEffectsService";

export default function Main() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const backendServiceRef = useRef<BackendService | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const isStreamingRef = useRef<boolean>(false);
  const lastDetectionFrameRef = useRef<ArrayBuffer | null>(null);
  const frameCounterRef = useRef(0);
  const skipFramesRef = useRef(0);

  const lastStartTimeRef = useRef<number>(0);
  const lastStopTimeRef = useRef<number>(0);
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);

  const lastDetectionRef = useRef<DetectionResult | null>(null);
  const lastFrameTimestampRef = useRef<number>(0);
  const processCurrentFrameRef = useRef<() => Promise<void>>(async () => {});
  const fpsTrackingRef = useRef({
    timestamps: [] as number[],
    maxSamples: 10,
    lastUpdateTime: Date.now(),
  });

  const backendServiceReadyRef = useRef(false);
  const isScanningRef = useRef(false);
  const videoRectRef = useRef<DOMRect | null>(null);
  const lastVideoRectUpdateRef = useRef<number>(0);

  const {
    isStreaming,
    isVideoLoading,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    cameraDevices,
    selectedCamera,
    setSelectedCamera,
  } = useCameraStore();

  const {
    currentDetections,
    detectionFps,
    setDetectionFps,
    trackedFaces,
    currentRecognitionResults: rawCurrentRecognitionResults,
  } = useDetectionStore();

  const {
    currentGroup,
    setCurrentGroup,
    attendanceGroups,
    showGroupManagement,
    setShowGroupManagement,
    showDeleteConfirmation,
    groupToDelete,
    newGroupName,
    setNewGroupName,
    attendanceCooldownSeconds,
    setAttendanceCooldownSeconds,
    reLogCooldownSeconds,
    setReLogCooldownSeconds,
    enableSpoofDetection,
    setEnableSpoofDetection,
    persistentCooldowns,
  } = useAttendanceStore();

  const {
    error,
    setError,
    success,
    setSuccess,
    warning,
    setWarning,
    showSettings,
    setShowSettings,
    groupInitialSection,
    setGroupInitialSection,
    settingsInitialSection,
    setSettingsInitialSection,
    quickSettings,
    setQuickSettings,
    audioSettings,
    setAudioSettings,
    setSidebarCollapsed,
  } = useUIStore();

  const recognitionEnabled = true;

  // Preload sound to minimize delay on first recognition
  useEffect(() => {
    if (
      audioSettings.recognitionSoundEnabled &&
      audioSettings.recognitionSoundUrl
    ) {
      soundEffects.preload(audioSettings.recognitionSoundUrl);
    }
  }, [
    audioSettings.recognitionSoundEnabled,
    audioSettings.recognitionSoundUrl,
  ]);

  const currentRecognitionResults =
    rawCurrentRecognitionResults instanceof Map
      ? rawCurrentRecognitionResults
      : new Map();

  useStreamState({
    isProcessingRef,
    animationFrameRef,
    isScanningRef,
    isStreamingRef,
    isStartingRef,
    isStoppingRef,
    lastStartTimeRef,
    lastStopTimeRef,
  });

  const { persistentCooldownsRef } = useAttendanceCooldown();

  const { calculateAngleConsistencyRef } = useFaceTracking();

  const {
    currentGroupRef,
    memberCacheRef,
    loadAttendanceDataRef,
    handleSelectGroup,
    handleCreateGroup,
    confirmDeleteGroup,
    cancelDeleteGroup,
  } = useAttendanceGroups();

  const { captureFrame, getCameraDevices } = useVideoStream({
    videoRef,
    canvasRef,
    isStreamingRef,
    isScanningRef,
    videoRectRef,
    lastVideoRectUpdateRef,
    isStartingRef,
  });

  useFaceDetection({
    backendServiceRef,
    isScanningRef,
    isStreamingRef,
    captureFrame,
    lastDetectionFrameRef,
    frameCounterRef,
    skipFramesRef,
    lastFrameTimestampRef,
    lastDetectionRef,
    processCurrentFrameRef,
    fpsTrackingRef,
  });

  const { performFaceRecognition } = useFaceRecognition({
    backendServiceRef,
    currentGroupRef,
    memberCacheRef,
    calculateAngleConsistencyRef,
    persistentCooldownsRef,
    loadAttendanceDataRef,
  });

  const { animate, resetOverlayRefs } = useOverlayRendering({
    videoRef,
    overlayCanvasRef,
    animationFrameRef,
    videoRectRef,
    lastVideoRectUpdateRef,
  });

  const stopCameraRef = useRef<((forceCleanup: boolean) => void) | null>(null);

  const { initializeWebSocket } = useBackendService({
    backendServiceRef,
    isStreamingRef,
    isScanningRef,
    isStartingRef,
    performFaceRecognition,
    lastDetectionFrameRef,
    lastFrameTimestampRef,
    lastDetectionRef,
    fpsTrackingRef,
    skipFramesRef,
    processCurrentFrameRef,
    stopCamera: stopCameraRef,
    animationFrameRef,
    streamRef,
    videoRef,
    backendServiceReadyRef,
  });

  const { startCamera, stopCamera } = useCameraControl({
    videoRef,
    streamRef,
    animationFrameRef,
    backendServiceRef,
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
    fpsTrackingRef,
    backendServiceReadyRef,
    processCurrentFrameRef,
    resetOverlayRefs,
    overlayCanvasRef,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    setSelectedCamera,
    setDetectionFps,
    setError,
    selectedCamera,
    cameraDevices,
    initializeWebSocket,
    getCameraDevices,
  });

  const requestGroupSelection = useCallback(() => {
    setSidebarCollapsed(false);

    if (attendanceGroups.length === 0) {
      setError("Create a group to start tracking.");
      setShowGroupManagement(true);
      return;
    }

    setError("Select a group from the sidebar to start tracking.");
  }, [
    attendanceGroups.length,
    setError,
    setShowGroupManagement,
    setSidebarCollapsed,
  ]);

  const startCameraGuarded = useCallback(() => {
    if (!currentGroup) {
      requestGroupSelection();
      return;
    }
    startCamera();
  }, [currentGroup, requestGroupSelection, startCamera]);

  // Handle start time changes from inline chip
  const handleStartTimeChange = useCallback(
    async (newTime: string) => {
      if (!currentGroup) return;

      try {
        const updatedSettings = {
          ...currentGroup.settings,
          class_start_time: newTime,
        };
        await attendanceManager.updateGroup(currentGroup.id, {
          settings: updatedSettings,
        });
        setCurrentGroup({
          ...currentGroup,
          settings: updatedSettings,
        });
      } catch (error) {
        console.error("Failed to update start time:", error);
      }
    },
    [currentGroup, setCurrentGroup],
  );

  // Set the ref after stopCamera is defined
  useEffect(() => {
    stopCameraRef.current = stopCamera;
  }, [stopCamera]);

  const cleanupOnUnload = useCallback(() => {
    try {
      cleanupStream(streamRef);
      cleanupVideo(videoRef, true);
      cleanupAnimationFrame(animationFrameRef);

      if (backendServiceRef.current) {
        try {
          const wsStatus = backendServiceRef.current.getWebSocketStatus();
          if (wsStatus === "connected" || wsStatus === "connecting") {
            backendServiceRef.current.disconnect();
          }
        } catch {
          // Ignore disconnect errors
        }
      }

      isStreamingRef.current = false;
      isScanningRef.current = false;
      isProcessingRef.current = false;
      isStartingRef.current = false;
      isStoppingRef.current = false;
      backendServiceReadyRef.current = false;
    } catch {
      // Ignore cleanup errors
    }
  }, []);

  useEffect(() => {
    if (isStreaming) {
      animate();
    }
    return () => {
      cleanupAnimationFrame(animationFrameRef);
    };
  }, [isStreaming, animate]);

  useEffect(() => {
    resetLastDetectionRef(lastDetectionRef);
    useDetectionStore.getState().resetDetectionState();

    if (isStreamingRef.current) {
      stopCamera(false);
    }
  }, [currentGroup, stopCamera, isStreamingRef, lastDetectionRef]);

  useEffect(() => {
    let cleanupExecuted = false;

    const performCleanup = () => {
      if (cleanupExecuted) return;
      cleanupExecuted = true;
      cleanupOnUnload();
    };

    const handleBeforeUnload = () => {
      performCleanup();
    };

    const handlePageHide = () => {
      performCleanup();
    };

    window.addEventListener("beforeunload", handleBeforeUnload, {
      capture: true,
    });
    window.addEventListener("pagehide", handlePageHide, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload, {
        capture: true,
      });
      window.removeEventListener("pagehide", handlePageHide, { capture: true });
    };
  }, [cleanupOnUnload]);

  // Listen for openSettings event (e.g., from WindowFooter update notification)
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent<{ section?: string }>) => {
      const section = event.detail?.section;
      if (section) {
        setSettingsInitialSection(section);
        setGroupInitialSection(undefined);
      }
      setShowSettings(true);
    };

    window.addEventListener(
      "openSettings",
      handleOpenSettings as EventListener,
    );

    return () => {
      window.removeEventListener(
        "openSettings",
        handleOpenSettings as EventListener,
      );
    };
  }, [setShowSettings, setGroupInitialSection, setSettingsInitialSection]);

  // Listen for system clock warnings emitted by AttendanceManager
  useEffect(() => {
    const handleClockWarning = (event: CustomEvent<{ message?: string }>) => {
      const message = event.detail?.message;
      if (message) {
        setWarning(message);
      }
    };

    window.addEventListener(
      "suri:clock-warning",
      handleClockWarning as unknown as EventListener,
    );

    return () => {
      window.removeEventListener(
        "suri:clock-warning",
        handleClockWarning as unknown as EventListener,
      );
    };
  }, [setWarning]);

  // Handle auto-pause on minimize
  const wasStreamingBeforeMinimize = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (window as any).suriElectron;
    if (!electron) return;

    const cleanupMinimize = electron.onMinimize(() => {
      if (isStreamingRef.current) {
        wasStreamingBeforeMinimize.current = true;
        stopCamera(false); // Pause tracking
        console.log("App minimized: Pausing tracking...");
      } else {
        wasStreamingBeforeMinimize.current = false;
      }
    });

    const cleanupRestore = electron.onRestore(() => {
      if (wasStreamingBeforeMinimize.current) {
        console.log("App restored: Resuming tracking...");
        startCameraGuarded();
        wasStreamingBeforeMinimize.current = false;
      }
    });

    return () => {
      if (cleanupMinimize) cleanupMinimize();
      if (cleanupRestore) cleanupRestore();
    };
  }, [stopCamera, startCameraGuarded]);

  return (
    <div className="h-full bg-black text-white flex flex-col overflow-hidden">
      {/* Floating Alert System */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xl px-4 pointer-events-none">
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto mb-3 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 p-4 rounded-xl text-emerald-100/90 shadow-2xl flex items-start gap-3"
            >
              <i className="fa-solid fa-circle-check mt-0.5 text-emerald-500"></i>
              <div className="flex-1 text-sm leading-relaxed">
                <span className="font-semibold text-emerald-500 mr-1.5 whitespace-nowrap">
                  Success:
                </span>
                {success}
              </div>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-sm"
                aria-label="Dismiss success"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </motion.div>
          )}

          {warning && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto mb-3 bg-amber-500/10 backdrop-blur-md border border-amber-500/20 p-4 rounded-xl text-amber-200/90 shadow-2xl flex items-start gap-3"
            >
              <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-400"></i>
              <div className="flex-1 text-sm leading-relaxed">
                <span className="font-semibold text-amber-400 mr-1.5 whitespace-nowrap">
                  Warning:
                </span>
                {warning}
              </div>
              <button
                type="button"
                onClick={() => setWarning(null)}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-sm"
                aria-label="Dismiss warning"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto bg-red-500/10 backdrop-blur-md border border-red-500/20 p-4 rounded-xl text-red-100/90 shadow-2xl flex items-start gap-3"
            >
              <i className="fa-solid fa-circle-xmark mt-0.5 text-red-500"></i>
              <div className="flex-1 text-sm leading-relaxed">
                <span className="font-semibold text-red-500 mr-1.5 whitespace-nowrap">
                  Error:
                </span>
                {error}
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-sm"
                aria-label="Dismiss error"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex flex-1 min-h-0 items-center justify-center px-4 pt-4">
            <VideoCanvas
              videoRef={videoRef}
              canvasRef={canvasRef}
              overlayCanvasRef={overlayCanvasRef}
              quickSettings={quickSettings}
              detectionFps={detectionFps}
              isVideoLoading={isVideoLoading}
              isStreaming={isStreaming}
              hasSelectedGroup={Boolean(currentGroup)}
              lateTrackingEnabled={
                !!currentGroup?.settings?.late_threshold_enabled
              }
              classStartTime={currentGroup?.settings?.class_start_time}
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
            hasSelectedGroup={Boolean(currentGroup)}
            lateTrackingEnabled={
              (currentGroup?.settings as { late_threshold_enabled?: boolean })
                ?.late_threshold_enabled ?? false
            }
            classStartTime={currentGroup?.settings?.class_start_time ?? "08:00"}
            onStartTimeChange={handleStartTimeChange}
          />
        </div>

        <Sidebar
          currentDetections={currentDetections}
          currentRecognitionResults={currentRecognitionResults}
          recognitionEnabled={recognitionEnabled}
          trackedFaces={trackedFaces}
          isStreaming={isStreaming}
          isVideoLoading={isVideoLoading}
          handleSelectGroup={handleSelectGroup}
        />
      </div>

      <GroupManagementModal
        showGroupManagement={showGroupManagement}
        setShowGroupManagement={setShowGroupManagement}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        handleCreateGroup={handleCreateGroup}
      />

      <AnimatePresence>
        {showSettings && (
          <Settings
            key="settings-modal"
            onBack={() => {
              setShowSettings(false);
              setGroupInitialSection(undefined);
              setSettingsInitialSection(undefined);
              loadAttendanceDataRef.current();
            }}
            isModal={true}
            quickSettings={quickSettings}
            onQuickSettingsChange={setQuickSettings}
            audioSettings={audioSettings}
            onAudioSettingsChange={setAudioSettings}
            attendanceSettings={{
              lateThresholdEnabled:
                currentGroup?.settings?.late_threshold_enabled ?? false,
              lateThresholdMinutes:
                currentGroup?.settings?.late_threshold_minutes ?? 15,
              classStartTime:
                currentGroup?.settings?.class_start_time ?? "08:00",
              attendanceCooldownSeconds: attendanceCooldownSeconds,
              reLogCooldownSeconds: reLogCooldownSeconds,
              enableSpoofDetection: enableSpoofDetection,
            }}
            onAttendanceSettingsChange={async (updates) => {
              if (updates.enableSpoofDetection !== undefined) {
                setEnableSpoofDetection(updates.enableSpoofDetection);
              }

              if (updates.attendanceCooldownSeconds !== undefined) {
                setAttendanceCooldownSeconds(updates.attendanceCooldownSeconds);
                try {
                  await attendanceManager.updateSettings({
                    attendance_cooldown_seconds:
                      updates.attendanceCooldownSeconds,
                  });
                } catch (error) {
                  console.error("Failed to update cooldown setting:", error);
                }
              }

              if (updates.reLogCooldownSeconds !== undefined) {
                setReLogCooldownSeconds(updates.reLogCooldownSeconds);
                try {
                  await attendanceManager.updateSettings({
                    relog_cooldown_seconds: updates.reLogCooldownSeconds,
                  });
                } catch (error) {
                  console.error(
                    "Failed to update re-log cooldown setting:",
                    error,
                  );
                }
              }

              if (
                currentGroup &&
                (updates.lateThresholdEnabled !== undefined ||
                  updates.lateThresholdMinutes !== undefined ||
                  updates.classStartTime !== undefined)
              ) {
                const updatedSettings = {
                  ...currentGroup.settings,
                  ...(updates.lateThresholdEnabled !== undefined && {
                    late_threshold_enabled: updates.lateThresholdEnabled,
                  }),
                  ...(updates.lateThresholdMinutes !== undefined && {
                    late_threshold_minutes: updates.lateThresholdMinutes,
                  }),
                  ...(updates.classStartTime !== undefined && {
                    class_start_time: updates.classStartTime,
                  }),
                };
                try {
                  await attendanceManager.updateGroup(currentGroup.id, {
                    settings: updatedSettings,
                  });
                  setCurrentGroup({
                    ...currentGroup,
                    settings: updatedSettings,
                  });
                } catch (error) {
                  console.error("Failed to update attendance settings:", error);
                }
              }
            }}
            initialGroupSection={groupInitialSection}
            initialSection={settingsInitialSection}
            currentGroup={currentGroup}
            onGroupSelect={handleSelectGroup}
            onGroupsChanged={() => loadAttendanceDataRef.current()}
            initialGroups={attendanceGroups}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        showDeleteConfirmation={showDeleteConfirmation}
        groupToDelete={groupToDelete}
        currentGroup={currentGroup}
        cancelDeleteGroup={cancelDeleteGroup}
        confirmDeleteGroup={confirmDeleteGroup}
      />
    </div>
  );
}
