import { Dropdown, Tooltip } from "@/components/shared"
import { formatCameraDevices } from "@/utils/cameraConstraints"

interface ControlBarProps {
  cameraDevices: MediaDeviceInfo[]
  selectedCamera: string
  setSelectedCamera: (deviceId: string) => void
  isStreaming: boolean
  startCamera: () => void
  stopCamera: (forceCleanup?: boolean) => void
  isShellReady: boolean
  hasGroups: boolean
  hasSelectedGroup: boolean
  hasEnrolledFaces: boolean
}

export function ControlBar({
  cameraDevices,
  selectedCamera,
  setSelectedCamera,
  isStreaming,
  startCamera,
  stopCamera,
  isShellReady,
  hasGroups,
  hasSelectedGroup,
  hasEnrolledFaces,
}: ControlBarProps) {
  const hasCameraDevices = cameraDevices.length > 0

  const handlePrimaryAction = () => {
    if (isStreaming) {
      stopCamera()
    } else {
      startCamera()
    }
  }

  const getButtonState = () => {
    if (isStreaming) {
      return {
        label: "Stop",
        className:
          "border border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 hover:text-rose-200 active:scale-95 transition-all tracking-wider",
        tooltip: undefined,
        enabled: true,
      }
    }

    if (!isShellReady) {
      return {
        label: "Preparing…",
        className:
          "bg-[#141518] border border-white/10 text-white/50 hover:bg-[#141518] hover:text-white/50",
        tooltip: "Loading groups and settings",
        enabled: false,
      }
    }

    if (!hasGroups) {
      return {
        label: "Start scan",
        className:
          "bg-[#141518] border border-white/10 text-white/50 hover:bg-[#141518] hover:text-white/50",
        tooltip: "Create a group to start scanning",
        enabled: false,
      }
    }

    if (!hasSelectedGroup) {
      return {
        label: "Start scan",
        className:
          "bg-[#141518] border border-white/10 text-white/50 hover:bg-[#141518] hover:text-white/50",
        tooltip: "Select a group to start scanning",
        enabled: false,
      }
    }

    if (!hasEnrolledFaces) {
      return {
        label: "Start scan",
        className:
          "bg-[#141518] border border-white/10 text-white/40 hover:bg-[#141518] hover:text-white/40",
        tooltip: "Enroll at least one member to start scanning",
        enabled: false,
      }
    }

    if (!hasCameraDevices) {
      return {
        label: "Start scan",
        className:
          "bg-[#141518] border border-white/10 text-white/40 hover:bg-[#141518] hover:text-white/40",
        tooltip: "No camera detected",
        enabled: false,
      }
    }

    const cyanStyle =
      "bg-cyan-400 font-semibold text-black hover:bg-cyan-300 active:scale-95 shadow-sm transition-all tracking-wider"

    return {
      label: "Start scan",
      className: cyanStyle,
      tooltip: undefined,
      enabled: true,
    }
  }

  const buttonState = getButtonState()

  return (
    <div>
      <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg p-3 pt-0">
        <div className="flex items-center space-x-6">
          {cameraDevices.length === 1 ?
            <div className="flex items-center rounded-lg border border-white/5 bg-white/5 px-4 py-2 text-sm font-medium text-white/90">
              <span className="max-w-[200px] truncate">
                {formatCameraDevices(cameraDevices)[0]?.label || "Camera"}
              </span>
            </div>
          : cameraDevices.length > 1 ?
            <div className="flex flex-col items-start space-y-1">
              <div className="w-fit max-w-[260px] min-w-[140px]">
                <Dropdown
                  options={formatCameraDevices(cameraDevices)}
                  value={selectedCamera}
                  onChange={(deviceId) => {
                    if (deviceId) setSelectedCamera(String(deviceId))
                  }}
                  placeholder="Select camera…"
                  emptyMessage="No cameras available"
                  disabled={isStreaming}
                  maxHeight={256}
                  buttonClassName="text-md px-4"
                  showPlaceholderOption={false}
                  allowClear={false}
                />
              </div>
            </div>
          : null}
        </div>

        <div className="flex items-center gap-3">
          <Tooltip content={buttonState.tooltip}>
            <button
              onClick={handlePrimaryAction}
              disabled={!buttonState.enabled}
              aria-label={buttonState.label}
              className={`flex min-w-28 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${buttonState.className}`}>
              {buttonState.label}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
