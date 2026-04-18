import { Dropdown } from "@/components/shared"
import type { CaptureSource } from "@/components/group/sections/registration/types"

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isStreaming: boolean
  isVideoReady: boolean
  cameraError: string | null
  onCapture: () => void
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
  cameraError,
  onCapture,
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
        className="h-full w-full scale-x-[-1] object-contain"
        playsInline
        muted
      />

      {/* Compact Camera Selection Overlay */}
      <div className="absolute top-4 right-4 z-30 w-64">
        <Dropdown
          options={cameraDevices.map((device, index) => ({
            value: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          }))}
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
          disabled={cameraDevices.length <= 1}
          maxHeight={256}
          buttonClassName="text-[11px] px-3 py-1.5 bg-[rgba(10,13,18,0.84)] border border-white/10 hover:bg-[rgba(15,19,25,0.92)] transition-all font-medium"
          showPlaceholderOption={false}
          allowClear={false}
        />
      </div>

      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="space-y-4 text-center">
            {cameraError ?
              <div className="flex flex-col items-center gap-4">
                <div className="max-w-[280px] rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                  <div className="text-[11px] font-medium text-red-200/60">{cameraError}</div>
                </div>
                <button
                  onClick={() => onStart()}
                  className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-6 py-2 text-[12px] font-medium text-white/70 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                  Retry Camera
                </button>
              </div>
            : <div className="relative flex flex-col items-center justify-center opacity-20">
                <svg
                  className="h-10 w-10 animate-pulse text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
            }
          </div>
        </div>
      )}

      {isStreaming && !isVideoReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
        </div>
      )}

      {isStreaming && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
          <button
            onClick={() => onCapture()}
            disabled={!isVideoReady || !!cameraError}
            className="group flex h-16 w-16 items-center justify-center rounded-full bg-white/20 p-1 transition-all hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
            title="Capture Face">
            <div className="h-full w-full rounded-full bg-white transition-transform group-active:scale-90" />
          </button>
        </div>
      )}
    </div>
  )
}
