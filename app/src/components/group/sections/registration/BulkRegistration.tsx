import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useBulkRegistration } from "@/components/group/sections/registration/hooks/useBulkRegistration"
import { BulkUploadArea } from "@/components/group/shared"
import { FaceAssignmentGrid } from "@/components/group/sections/registration/components/FaceAssignmentGrid"
import { RegistrationResults } from "@/components/group/sections/registration/components/RegistrationResults"

interface BulkRegistrationProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onRefresh?: () => Promise<void> | void
  onClose: () => void
}

export function BulkRegistration({ group, members, onRefresh, onClose }: BulkRegistrationProps) {
  const {
    uploadedFiles,
    detectedFaces,
    isDetecting,
    isRegistering,
    error,
    setError,
    registrationResults,
    availableMembers,
    pendingDuplicates,
    handleFilesSelected,
    handleConfirmDuplicates,
    handleCancelDuplicates,
    handleDismissDuplicates,
    handleAssignMember,
    handleUnassign,
    handleBulkRegister,
    handleClearFiles,
  } = useBulkRegistration(group, members, onRefresh)

  const assignedCount = detectedFaces.filter((f) => f.assignedPersonId).length
  const successCount = registrationResults?.filter((r) => r.success).length || 0
  const failedCount = registrationResults?.filter((r) => !r.success).length || 0

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
      {pendingDuplicates && (
        <>
          <div className="absolute inset-0 z-40 bg-black/40" />

          <div className="intro-y absolute top-1/2 left-1/2 z-50 max-w-[95%] min-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-amber-500/30 bg-black/90 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20">
                <i className="fa-solid fa-triangle-exclamation text-xl text-amber-400"></i>
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Duplicate Files Detected</h4>
                <p className="text-xs font-medium text-amber-200/60">
                  {pendingDuplicates.duplicates.length} file(s) already uploaded
                </p>
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs text-white/60">
                The following files appear to be duplicates:
              </p>
              <div className="custom-scroll max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2.5">
                {pendingDuplicates.duplicates.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-white/50">
                    <i className="fa-solid fa-file-image text-[10px] text-white/30"></i>
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
              {pendingDuplicates.newFiles.length > 0 && (
                <p className="mt-2 text-[10px] text-white/40">
                  {pendingDuplicates.newFiles.length} new file(s) will be added regardless.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void handleDismissDuplicates()}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/50 transition-all hover:bg-white/10 hover:text-white">
                Cancel
              </button>
              {pendingDuplicates.newFiles.length > 0 && (
                <button
                  onClick={() => void handleCancelDuplicates()}
                  className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-medium text-white transition-all hover:bg-white/20">
                  Skip
                </button>
              )}
              <button
                onClick={() => void handleConfirmDuplicates()}
                className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-amber-500 uppercase transition-all hover:bg-amber-500/20">
                Add Anyway
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="mx-6 mt-4 flex shrink-0 items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          <div className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="border-none bg-transparent p-0 text-red-200/50 shadow-none transition hover:text-red-100">
            <i className="fa fa-times text-xs"></i>
          </button>
        </div>
      )}

      <div
        className={`scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex-1 overflow-y-auto px-6 py-6 ${
          !registrationResults && uploadedFiles.length === 0 ? "flex flex-col justify-center" : ""
        }`}>
        {!registrationResults && (
          <BulkUploadArea
            uploadedCount={uploadedFiles.length}
            isDetecting={isDetecting}
            onFilesSelected={handleFilesSelected}
            onClear={handleClearFiles}
          />
        )}

        {detectedFaces.length > 0 && !registrationResults && (
          <FaceAssignmentGrid
            detectedFaces={detectedFaces}
            members={members}
            availableMembers={availableMembers}
            assignedCount={assignedCount}
            isRegistering={isRegistering}
            onAssignMember={handleAssignMember}
            onUnassign={handleUnassign}
            onBulkRegister={handleBulkRegister}
          />
        )}

        {registrationResults && (
          <RegistrationResults
            results={registrationResults}
            successCount={successCount}
            failedCount={failedCount}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}
