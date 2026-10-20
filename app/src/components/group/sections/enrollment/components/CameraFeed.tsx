import { Video } from "lucide-react"
import { Dropdown } from "@/components/shared"
import type { CaptureSource } from "@/components/group/sections/enrollment/types"
import { formatCameraDevices } from "@/utils/cameraConstraints"

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isStreaming: boolean
  isVideoReady: boolean
  onStart: (deviceId?: string) => void
  onStop: () => void
  source: CaptureSource

  cameraDevices: MediaDeviceInfo[]
  selectedCamera: string
  setSelectedCamera: (deviceId: string) => void
}

export function CameraFeed({
  videoRef,
  isStreaming,
  isVideoReady,
  onStart,
  onStop,
  source,
  cameraDevices,
  selectedCamera,
  setSelectedCamera,
}: CameraFeedProps) {
  if (source !== "live") return null

  return (
    <div className="group/feed relative h-full w-full">
      <video
        ref={videoRef}
        className="h-full w-full scale-x-[-1] bg-[var(--bg-canvas)] object-contain"
        playsInline
        muted
      />

      {/* Compact Camera Selection Overlay (Only shown when multiple cameras exist) */}
      {cameraDevices.length > 1 && (
        <div className="absolute top-4 right-4 z-30 w-64">
          <Dropdown
            options={formatCameraDevices(cameraDevices)}
            value={selectedCamera}
            onChange={(deviceId) => {
              if (deviceId) {
                setSelectedCamera(String(deviceId))
                if (isStreaming) {
                  onStop()
                  setTimeout(() => onStart(String(deviceId)), 300)
                }
              }
            }}
            placeholder="Select camera…"
            emptyMessage="No cameras available"
            disabled={false}
            maxHeight={256}
            buttonClassName="text-[11px] px-3 py-1.5 bg-[#141518] border border-white/10 hover:bg-[#1a1c20] transition-all font-medium"
            showPlaceholderOption={false}
            allowClear={false}
          />
        </div>
      )}

      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="relative flex flex-col items-center justify-center opacity-20">
            <Video className="h-10 w-10 animate-pulse text-white" strokeWidth={1.5} />
          </div>
        </div>
      )}

      {isStreaming && !isVideoReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
        </div>
      )}
    </div>
  )
}
