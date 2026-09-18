import { useEffect } from "react"
import { ErrorMessage } from "@/components/common"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useBulkEnrollment } from "@/components/group/sections/enrollment/hooks/useBulkEnrollment"
import { BulkUploadArea } from "@/components/group/shared"
import { FaceAssignmentGrid } from "@/components/group/sections/enrollment/components/FaceAssignmentGrid"
import { EnrollmentResults } from "@/components/group/sections/enrollment/components/EnrollmentResults"

interface BulkEnrollmentProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onRefresh?: () => Promise<void> | void
  onClose: () => void
  className?: string
}

export function BulkEnrollment({
  group,
  members,
  onRefresh,
  onClose,
  className,
}: BulkEnrollmentProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [onClose])

  const {
    uploadedFiles,
    detectedFaces,
    isDetecting,
    isEnrolling,
    error,
    setError,
    enrollmentResults,
    availableMembers,
    pendingDuplicates,
    handleFilesSelected,
    handleConfirmDuplicates,
    handleCancelDuplicates,
    handleDismissDuplicates,
    handleAssignMember,
    handleUnassign,
    handleBulkEnroll,
    handleClearFiles,
  } = useBulkEnrollment(group, members, onRefresh)

  const assignedCount = detectedFaces.filter((f) => f.assignedPersonId).length
  const successCount = enrollmentResults?.filter((r) => r.success).length || 0
  const failedCount = enrollmentResults?.filter((r) => !r.success).length || 0

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${className ?? ""}`}>
      {/* Duplicate files dialog — floating, minimal */}
      {pendingDuplicates && (
        <>
          <div className="absolute inset-0 z-40 bg-black/60" />

          <div className="absolute top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="rounded-2xl bg-[#111318] px-6 py-5">
              {/* Header */}
              <div className="mb-1 flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-[13px] text-amber-400" />
                <span className="text-[13px] font-semibold text-white">Duplicate files</span>
              </div>
              <p className="mb-4 pl-5 text-[11px] leading-relaxed text-white/45">
                {pendingDuplicates.duplicates.length} file
                {pendingDuplicates.duplicates.length !== 1 ? "s" : ""} already uploaded.
                {pendingDuplicates.newFiles.length > 0 &&
                  ` ${pendingDuplicates.newFiles.length} new file${pendingDuplicates.newFiles.length !== 1 ? "s" : ""} will be added.`}
              </p>

              {/* File list */}
              <div className="custom-scroll mb-5 max-h-28 space-y-0.5 overflow-y-auto pl-5">
                {pendingDuplicates.duplicates.map((file, idx) => (
                  <div key={idx} className="truncate text-[11px] text-white/35">
                    {file.name}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4">
                <button
                  onClick={() => void handleDismissDuplicates()}
                  className="rounded px-1 text-[11px] font-medium text-white/40 transition-colors hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
                  Cancel
                </button>
                {pendingDuplicates.newFiles.length > 0 && (
                  <button
                    onClick={() => void handleCancelDuplicates()}
                    className="rounded px-1 text-[11px] font-medium text-white/55 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
                    Skip duplicates
                  </button>
                )}
                <button
                  onClick={() => void handleConfirmDuplicates()}
                  className="rounded px-1 text-[11px] font-semibold text-amber-400 transition-colors hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none">
                  Add anyway
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="px-8 pt-4">
          <ErrorMessage message={error} onClose={() => setError(null)} />
        </div>
      )}

      {/* Main scroll area */}
      <div
        className={`custom-scroll flex-1 overflow-y-auto px-8 py-8 ${
          !enrollmentResults && uploadedFiles.length === 0 ? "flex flex-col justify-center" : ""
        }`}>
        {!enrollmentResults && (
          <BulkUploadArea
            uploadedCount={uploadedFiles.length}
            isDetecting={isDetecting}
            onFilesSelected={handleFilesSelected}
            onClear={handleClearFiles}
          />
        )}

        {detectedFaces.length > 0 && !enrollmentResults && (
          <FaceAssignmentGrid
            detectedFaces={detectedFaces}
            members={members}
            availableMembers={availableMembers}
            assignedCount={assignedCount}
            onAssignMember={handleAssignMember}
            onUnassign={handleUnassign}
          />
        )}

        {enrollmentResults && (
          <EnrollmentResults
            results={enrollmentResults}
            successCount={successCount}
            failedCount={failedCount}
            onClose={onClose}
          />
        )}
      </div>

      {/* Sticky bottom — enroll CTA, only when faces are assigned */}
      {assignedCount > 0 && !enrollmentResults && (
        <div className="shrink-0 px-8 py-4">
          <button
            onClick={handleBulkEnroll}
            disabled={isEnrolling}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg py-2.5 text-[13px] font-semibold text-cyan-400 transition-all hover:text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none disabled:text-white/20">
            {isEnrolling ?
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400/60" />
                <span>
                  Enrolling {assignedCount} {assignedCount === 1 ? "face" : "faces"}…
                </span>
              </>
            : <span>
                Enroll {assignedCount} {assignedCount === 1 ? "Face" : "Faces"}
              </span>
            }
          </button>
        </div>
      )}
    </div>
  )
}
