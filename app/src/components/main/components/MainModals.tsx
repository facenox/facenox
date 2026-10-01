import { useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { attendanceManager } from "@/services"
import { PinPromptModal } from "@/components/common"
import { GroupManagementModal } from "./GroupManagementModal"
import { DeleteConfirmationModal } from "./DeleteConfirmationModal"
import { Settings } from "@/components/settings"

interface MainModalsProps {
  /** Callback to submit a new group creation to the backend. */
  handleCreateGroup: () => void
  /** Callback to run the deletion sequence on the selected group. */
  confirmDeleteGroup: () => void
  /** Callback to abort the group deletion prompt. */
  cancelDeleteGroup: () => void
  /** Ref to invoke database reload updates inside settings callbacks. */
  loadAttendanceDataRef: React.MutableRefObject<() => Promise<void>>
}

/**
 * MainModals coordinates all modal overlays for the primary dashboard.
 *
 * Separating this layout block from Main.tsx prevents high-frequency updates
 * (like video stream rendering) from triggering unnecessary modal render computations.
 */
export function MainModals({
  handleCreateGroup,
  confirmDeleteGroup,
  cancelDeleteGroup,
  loadAttendanceDataRef,
}: MainModalsProps) {
  const {
    currentGroup,
    setCurrentGroup,
    attendanceGroups,
    setAttendanceGroups,
    groupMembers,
    showGroupManagement,
    setShowGroupManagement,
    showDeleteConfirmation,
    groupToDelete,
    newGroupName,
    setNewGroupName,
    attendanceCooldownSeconds,
    setAttendanceCooldownSeconds,
    enableSpoofDetection,
    setEnableSpoofDetection,
    maxRecognitionFacesPerFrame,
    setMaxRecognitionFacesPerFrame,
    dataRetentionDays,
    setDataRetentionDays,
  } = useAttendanceStore()

  const {
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
  } = useUIStore()

  const { resetEnrollment } = useGroupUIStore.getState()

  // Local helper to synchronize changes when settings update group attributes
  const syncUpdatedGroupLocally = useCallback(
    (updatedGroup: typeof currentGroup) => {
      setCurrentGroup(updatedGroup)
      if (!updatedGroup) return

      const exists = attendanceGroups.some((g) => g.id === updatedGroup.id)
      setAttendanceGroups(
        exists ?
          attendanceGroups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
        : [...attendanceGroups, updatedGroup],
      )
      useGroupStore.getState().setSelectedGroup(updatedGroup)
    },
    [attendanceGroups, setAttendanceGroups, setCurrentGroup],
  )

  return (
    <>
      <PinPromptModal />

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
              setShowSettings(false)
              setGroupInitialSection(undefined)
              setSettingsInitialSection(undefined)
              resetEnrollment()
              loadAttendanceDataRef.current()
            }}
            isModal={true}
            quickSettings={quickSettings}
            onQuickSettingsChange={setQuickSettings}
            audioSettings={audioSettings}
            onAudioSettingsChange={setAudioSettings}
            attendanceSettings={{
              lateThresholdEnabled:
                (currentGroup?.id !== "all" ? currentGroup : attendanceGroups[0])?.settings
                  ?.late_threshold_enabled ?? false,
              lateThresholdMinutes:
                (currentGroup?.id !== "all" ? currentGroup : attendanceGroups[0])?.settings
                  ?.late_threshold_minutes ?? 15,
              classStartTime:
                (currentGroup?.id !== "all" ? currentGroup : attendanceGroups[0])?.settings
                  ?.class_start_time ?? "08:00",
              attendanceCooldownSeconds: attendanceCooldownSeconds,
              enableSpoofDetection: enableSpoofDetection,
              maxRecognitionFacesPerFrame: maxRecognitionFacesPerFrame,
              trackCheckout:
                (currentGroup?.id !== "all" ? currentGroup : attendanceGroups[0])?.settings
                  ?.track_checkout ?? false,
              dataRetentionDays: dataRetentionDays,
              biometricConsentCertified:
                (currentGroup?.id !== "all" ? currentGroup : attendanceGroups[0])?.settings
                  ?.biometric_consent_certified ?? false,
            }}
            onAttendanceSettingsChange={async (updates) => {
              if (updates.enableSpoofDetection !== undefined) {
                setEnableSpoofDetection(updates.enableSpoofDetection)
              }

              if (updates.maxRecognitionFacesPerFrame !== undefined) {
                setMaxRecognitionFacesPerFrame(updates.maxRecognitionFacesPerFrame)
              }

              const editableGroup =
                currentGroup && currentGroup.id !== "all" ? currentGroup : attendanceGroups[0]

              if (updates.biometricConsentCertified !== undefined && editableGroup) {
                const updatedSettings = {
                  ...editableGroup.settings,
                  biometric_consent_certified: updates.biometricConsentCertified,
                }
                try {
                  await attendanceManager.updateGroup(editableGroup.id, {
                    settings: updatedSettings,
                  })
                  syncUpdatedGroupLocally({
                    ...editableGroup,
                    settings: updatedSettings,
                  })
                } catch (error) {
                  console.error("Failed to update biometric consent certification setting:", error)
                }
              }

              if (updates.trackCheckout !== undefined && editableGroup) {
                const updatedSettings = {
                  ...editableGroup.settings,
                  track_checkout: updates.trackCheckout,
                }
                try {
                  await attendanceManager.updateGroup(editableGroup.id, {
                    settings: updatedSettings,
                  })
                  syncUpdatedGroupLocally({
                    ...editableGroup,
                    settings: updatedSettings,
                  })
                } catch (error) {
                  console.error("Failed to update track checkout setting:", error)
                }
              }

              if (updates.attendanceCooldownSeconds !== undefined) {
                setAttendanceCooldownSeconds(updates.attendanceCooldownSeconds)
                try {
                  await attendanceManager.updateSettings({
                    attendance_cooldown_seconds: updates.attendanceCooldownSeconds,
                  })
                } catch (error) {
                  console.error("Failed to update cooldown setting:", error)
                }
              }

              if (updates.dataRetentionDays !== undefined) {
                setDataRetentionDays(updates.dataRetentionDays)
                try {
                  await attendanceManager.updateSettings({
                    data_retention_days: updates.dataRetentionDays,
                  })
                } catch (error) {
                  console.error("Failed to update data retention setting:", error)
                }
              }

              if (
                editableGroup &&
                (updates.lateThresholdEnabled !== undefined ||
                  updates.lateThresholdMinutes !== undefined ||
                  updates.classStartTime !== undefined)
              ) {
                const updatedSettings = {
                  ...editableGroup.settings,
                  ...(updates.lateThresholdEnabled !== undefined && {
                    late_threshold_enabled: updates.lateThresholdEnabled,
                  }),
                  ...(updates.lateThresholdMinutes !== undefined && {
                    late_threshold_minutes: updates.lateThresholdMinutes,
                  }),
                  ...(updates.classStartTime !== undefined && {
                    class_start_time: updates.classStartTime,
                  }),
                }
                try {
                  await attendanceManager.updateGroup(editableGroup.id, {
                    settings: updatedSettings,
                  })
                  syncUpdatedGroupLocally({
                    ...editableGroup,
                    settings: updatedSettings,
                  })
                } catch (error) {
                  console.error("Failed to update attendance settings:", error)
                }
              }
            }}
            initialGroupSection={groupInitialSection}
            initialSection={settingsInitialSection}
            currentGroup={
              currentGroup && currentGroup.id !== "all" ? currentGroup : attendanceGroups[0] || null
            }
            currentGroupMembers={groupMembers}
            onGroupSelect={syncUpdatedGroupLocally}
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
    </>
  )
}
